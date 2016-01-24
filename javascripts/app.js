(function() {
  'use strict';

  var globals = typeof window === 'undefined' ? global : window;
  if (typeof globals.require === 'function') return;

  var modules = {};
  var cache = {};
  var has = ({}).hasOwnProperty;

  var aliases = {};

  var endsWith = function(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
  };

  var unalias = function(alias, loaderPath) {
    var start = 0;
    if (loaderPath) {
      if (loaderPath.indexOf('components/' === 0)) {
        start = 'components/'.length;
      }
      if (loaderPath.indexOf('/', start) > 0) {
        loaderPath = loaderPath.substring(start, loaderPath.indexOf('/', start));
      }
    }
    var result = aliases[alias + '/index.js'] || aliases[loaderPath + '/deps/' + alias + '/index.js'];
    if (result) {
      return 'components/' + result.substring(0, result.length - '.js'.length);
    }
    return alias;
  };

  var expand = (function() {
    var reg = /^\.\.?(\/|$)/;
    return function(root, name) {
      var results = [], parts, part;
      parts = (reg.test(name) ? root + '/' + name : name).split('/');
      for (var i = 0, length = parts.length; i < length; i++) {
        part = parts[i];
        if (part === '..') {
          results.pop();
        } else if (part !== '.' && part !== '') {
          results.push(part);
        }
      }
      return results.join('/');
    };
  })();
  var dirname = function(path) {
    return path.split('/').slice(0, -1).join('/');
  };

  var localRequire = function(path) {
    return function(name) {
      var absolute = expand(dirname(path), name);
      return globals.require(absolute, path);
    };
  };

  var initModule = function(name, definition) {
    var module = {id: name, exports: {}};
    cache[name] = module;
    definition(module.exports, localRequire(name), module);
    return module.exports;
  };

  var require = function(name, loaderPath) {
    var path = expand(name, '.');
    if (loaderPath == null) loaderPath = '/';
    path = unalias(name, loaderPath);

    if (has.call(cache, path)) return cache[path].exports;
    if (has.call(modules, path)) return initModule(path, modules[path]);

    var dirIndex = expand(path, './index');
    if (has.call(cache, dirIndex)) return cache[dirIndex].exports;
    if (has.call(modules, dirIndex)) return initModule(dirIndex, modules[dirIndex]);

    throw new Error('Cannot find module "' + name + '" from '+ '"' + loaderPath + '"');
  };

  require.alias = function(from, to) {
    aliases[to] = from;
  };

  require.register = require.define = function(bundle, fn) {
    if (typeof bundle === 'object') {
      for (var key in bundle) {
        if (has.call(bundle, key)) {
          modules[key] = bundle[key];
        }
      }
    } else {
      modules[bundle] = fn;
    }
  };

  require.list = function() {
    var result = [];
    for (var item in modules) {
      if (has.call(modules, item)) {
        result.push(item);
      }
    }
    return result;
  };

  require.brunch = true;
  globals.require = require;
})();
require.register("FileSaver", function(exports, require, module) {
/* FileSaver.js
 * A saveAs() FileSaver implementation.
 * 2014-07-21
 *
 * By Eli Grey, http://eligrey.com
 * License: X11/MIT
 *   See https://github.com/eligrey/FileSaver.js/blob/master/LICENSE.md
 */

/*global self */
/*jslint bitwise: true, indent: 4, laxbreak: true, laxcomma: true, smarttabs: true, plusplus: true */

/*! @source http://purl.eligrey.com/github/FileSaver.js/blob/master/FileSaver.js */

var saveAs = saveAs
  // IE 10+ (native saveAs)
  || (typeof navigator !== "undefined" &&
      navigator.msSaveOrOpenBlob && navigator.msSaveOrOpenBlob.bind(navigator))
  // Everyone else
  || (function(view) {
	"use strict";
	// IE <10 is explicitly unsupported
	if (typeof navigator !== "undefined" &&
	    /MSIE [1-9]\./.test(navigator.userAgent)) {
		return;
	}
	var
		  doc = view.document
		  // only get URL when necessary in case Blob.js hasn't overridden it yet
		, get_URL = function() {
			return view.URL || view.webkitURL || view;
		}
		, save_link = doc.createElementNS("http://www.w3.org/1999/xhtml", "a")
		, can_use_save_link = !view.externalHost && "download" in save_link
		, click = function(node) {
			var event = doc.createEvent("MouseEvents");
			event.initMouseEvent(
				"click", true, false, view, 0, 0, 0, 0, 0
				, false, false, false, false, 0, null
			);
			node.dispatchEvent(event);
		}
		, webkit_req_fs = view.webkitRequestFileSystem
		, req_fs = view.requestFileSystem || webkit_req_fs || view.mozRequestFileSystem
		, throw_outside = function(ex) {
			(view.setImmediate || view.setTimeout)(function() {
				throw ex;
			}, 0);
		}
		, force_saveable_type = "application/octet-stream"
		, fs_min_size = 0
		// See https://code.google.com/p/chromium/issues/detail?id=375297#c7 for
		// the reasoning behind the timeout and revocation flow
		, arbitrary_revoke_timeout = 10
		, revoke = function(file) {
			setTimeout(function() {
				if (typeof file === "string") { // file is an object URL
					get_URL().revokeObjectURL(file);
				} else { // file is a File
					file.remove();
				}
			}, arbitrary_revoke_timeout);
		}
		, dispatch = function(filesaver, event_types, event) {
			event_types = [].concat(event_types);
			var i = event_types.length;
			while (i--) {
				var listener = filesaver["on" + event_types[i]];
				if (typeof listener === "function") {
					try {
						listener.call(filesaver, event || filesaver);
					} catch (ex) {
						throw_outside(ex);
					}
				}
			}
		}
		, FileSaver = function(blob, name) {
			// First try a.download, then web filesystem, then object URLs
			var
				  filesaver = this
				, type = blob.type
				, blob_changed = false
				, object_url
				, target_view
				, dispatch_all = function() {
					dispatch(filesaver, "writestart progress write writeend".split(" "));
				}
				// on any filesys errors revert to saving with object URLs
				, fs_error = function() {
					// don't create more object URLs than needed
					if (blob_changed || !object_url) {
						object_url = get_URL().createObjectURL(blob);
					}
					if (target_view) {
						target_view.location.href = object_url;
					} else {
						var new_tab = view.open(object_url, "_blank");
						if (new_tab == undefined && typeof safari !== "undefined") {
							//Apple do not allow window.open, see http://bit.ly/1kZffRI
							view.location.href = object_url
						}
					}
					filesaver.readyState = filesaver.DONE;
					dispatch_all();
					revoke(object_url);
				}
				, abortable = function(func) {
					return function() {
						if (filesaver.readyState !== filesaver.DONE) {
							return func.apply(this, arguments);
						}
					};
				}
				, create_if_not_found = {create: true, exclusive: false}
				, slice
			;
			filesaver.readyState = filesaver.INIT;
			if (!name) {
				name = "download";
			}
			if (can_use_save_link) {
				object_url = get_URL().createObjectURL(blob);
				save_link.href = object_url;
				save_link.download = name;
				click(save_link);
				filesaver.readyState = filesaver.DONE;
				dispatch_all();
				revoke(object_url);
				return;
			}
			// Object and web filesystem URLs have a problem saving in Google Chrome when
			// viewed in a tab, so I force save with application/octet-stream
			// http://code.google.com/p/chromium/issues/detail?id=91158
			// Update: Google errantly closed 91158, I submitted it again:
			// https://code.google.com/p/chromium/issues/detail?id=389642
			if (view.chrome && type && type !== force_saveable_type) {
				slice = blob.slice || blob.webkitSlice;
				blob = slice.call(blob, 0, blob.size, force_saveable_type);
				blob_changed = true;
			}
			// Since I can't be sure that the guessed media type will trigger a download
			// in WebKit, I append .download to the filename.
			// https://bugs.webkit.org/show_bug.cgi?id=65440
			if (webkit_req_fs && name !== "download") {
				name += ".download";
			}
			if (type === force_saveable_type || webkit_req_fs) {
				target_view = view;
			}
			if (!req_fs) {
				fs_error();
				return;
			}
			fs_min_size += blob.size;
			req_fs(view.TEMPORARY, fs_min_size, abortable(function(fs) {
				fs.root.getDirectory("saved", create_if_not_found, abortable(function(dir) {
					var save = function() {
						dir.getFile(name, create_if_not_found, abortable(function(file) {
							file.createWriter(abortable(function(writer) {
								writer.onwriteend = function(event) {
									target_view.location.href = file.toURL();
									filesaver.readyState = filesaver.DONE;
									dispatch(filesaver, "writeend", event);
									revoke(file);
								};
								writer.onerror = function() {
									var error = writer.error;
									if (error.code !== error.ABORT_ERR) {
										fs_error();
									}
								};
								"writestart progress write abort".split(" ").forEach(function(event) {
									writer["on" + event] = filesaver["on" + event];
								});
								writer.write(blob);
								filesaver.abort = function() {
									writer.abort();
									filesaver.readyState = filesaver.DONE;
								};
								filesaver.readyState = filesaver.WRITING;
							}), fs_error);
						}), fs_error);
					};
					dir.getFile(name, {create: false}, abortable(function(file) {
						// delete file if it already exists
						file.remove();
						save();
					}), abortable(function(ex) {
						if (ex.code === ex.NOT_FOUND_ERR) {
							save();
						} else {
							fs_error();
						}
					}));
				}), fs_error);
			}), fs_error);
		}
		, FS_proto = FileSaver.prototype
		, saveAs = function(blob, name) {
			return new FileSaver(blob, name);
		}
	;
	FS_proto.abort = function() {
		var filesaver = this;
		filesaver.readyState = filesaver.DONE;
		dispatch(filesaver, "abort");
	};
	FS_proto.readyState = FS_proto.INIT = 0;
	FS_proto.WRITING = 1;
	FS_proto.DONE = 2;

	FS_proto.error =
	FS_proto.onwritestart =
	FS_proto.onprogress =
	FS_proto.onwrite =
	FS_proto.onabort =
	FS_proto.onerror =
	FS_proto.onwriteend =
		null;

	return saveAs;
}(
	   typeof self !== "undefined" && self
	|| typeof window !== "undefined" && window
	|| this.content
));
// `self` is undefined in Firefox for Android content script context
// while `this` is nsIContentFrameMessageManager
// with an attribute `content` that corresponds to the window

if (typeof module !== "undefined" && module !== null) {
  module.exports = saveAs;
} else if ((typeof define !== "undefined" && define !== null) && (define.amd != null)) {
  define([], function() {
    return saveAs;
  });
}

});

;require.register("alertify", function(exports, require, module) {
(function (global, undefined) {
	"use strict";

	var document = global.document,
	    Alertify;

	Alertify = function () {

		var _alertify = {},
		    dialogs   = {},
		    isopen    = false,
		    keys      = { ENTER: 13, ESC: 27, SPACE: 32 },
		    queue     = [],
		    $, btnCancel, btnOK, btnReset, btnResetBack, btnFocus, elCallee, elCover, elDialog, elLog, form, input, getTransitionEvent;

		/**
		 * Markup pieces
		 * @type {Object}
		 */
		dialogs = {
			buttons : {
				holder : "<nav class=\"alertify-buttons\">{{buttons}}</nav>",
				submit : "<button type=\"submit\" class=\"alertify-button alertify-button-ok\" id=\"alertify-ok\">{{ok}}</button>",
				ok     : "<button class=\"alertify-button alertify-button-ok\" id=\"alertify-ok\">{{ok}}</button>",
				cancel : "<button class=\"alertify-button alertify-button-cancel\" id=\"alertify-cancel\">{{cancel}}</button>"
			},
			input   : "<div class=\"alertify-text-wrapper\"><input type=\"text\" class=\"alertify-text\" id=\"alertify-text\"></div>",
			message : "<p class=\"alertify-message\">{{message}}</p>",
			log     : "<article class=\"alertify-log{{class}}\">{{message}}</article>"
		};

		/**
		 * Return the proper transitionend event
		 * @return {String}    Transition type string
		 */
		getTransitionEvent = function () {
			var t,
			    type,
			    supported   = false,
			    el          = document.createElement("fakeelement"),
			    transitions = {
				    "WebkitTransition" : "webkitTransitionEnd",
				    "MozTransition"    : "transitionend",
				    "OTransition"      : "otransitionend",
				    "transition"       : "transitionend"
			    };

			for (t in transitions) {
				if (el.style[t] !== undefined) {
					type      = transitions[t];
					supported = true;
					break;
				}
			}

			return {
				type      : type,
				supported : supported
			};
		};

		/**
		 * Shorthand for document.getElementById()
		 *
		 * @param  {String} id    A specific element ID
		 * @return {Object}       HTML element
		 */
		$ = function (id) {
			return document.getElementById(id);
		};

		/**
		 * Alertify private object
		 * @type {Object}
		 */
		_alertify = {

			/**
			 * Labels object
			 * @type {Object}
			 */
			labels : {
				ok     : "OK",
				cancel : "Cancel"
			},

			/**
			 * Delay number
			 * @type {Number}
			 */
			delay : 5000,

			/**
			 * Whether buttons are reversed (default is secondary/primary)
			 * @type {Boolean}
			 */
			buttonReverse : false,

			/**
			 * Which button should be focused by default
			 * @type {String}	"ok" (default), "cancel", or "none"
			 */
			buttonFocus : "ok",

			/**
			 * Set the transition event on load
			 * @type {[type]}
			 */
			transition : undefined,

			/**
			 * Set the proper button click events
			 *
			 * @param {Function} fn    [Optional] Callback function
			 *
			 * @return {undefined}
			 */
			addListeners : function (fn) {
				var hasOK     = (typeof btnOK !== "undefined"),
				    hasCancel = (typeof btnCancel !== "undefined"),
				    hasInput  = (typeof input !== "undefined"),
				    val       = "",
				    self      = this,
				    ok, cancel, common, key, reset;

				// ok event handler
				ok = function (event) {
					if (typeof event.preventDefault !== "undefined") event.preventDefault();
					common(event);
					if (typeof input !== "undefined") val = input.value;
					if (typeof fn === "function") {
						if (typeof input !== "undefined") {
							fn(true, val);
						}
						else fn(true);
					}
					return false;
				};

				// cancel event handler
				cancel = function (event) {
					if (typeof event.preventDefault !== "undefined") event.preventDefault();
					common(event);
					if (typeof fn === "function") fn(false);
					return false;
				};

				// common event handler (keyup, ok and cancel)
				common = function (event) {
					self.hide();
					self.unbind(document.body, "keyup", key);
					self.unbind(btnReset, "focus", reset);
					if (hasOK) self.unbind(btnOK, "click", ok);
					if (hasCancel) self.unbind(btnCancel, "click", cancel);
				};

				// keyup handler
				key = function (event) {
					var keyCode = event.keyCode;
					if ((keyCode === keys.SPACE && !hasInput) || (hasInput && keyCode === keys.ENTER)) ok(event);
					if (keyCode === keys.ESC && hasCancel) cancel(event);
				};

				// reset focus to first item in the dialog
				reset = function (event) {
					if (hasInput) input.focus();
					else if (!hasCancel || self.buttonReverse) btnOK.focus();
					else btnCancel.focus();
				};

				// handle reset focus link
				// this ensures that the keyboard focus does not
				// ever leave the dialog box until an action has
				// been taken
				this.bind(btnReset, "focus", reset);
				this.bind(btnResetBack, "focus", reset);
				// handle OK click
				if (hasOK) this.bind(btnOK, "click", ok);
				// handle Cancel click
				if (hasCancel) this.bind(btnCancel, "click", cancel);
				// listen for keys, Cancel => ESC
				this.bind(document.body, "keyup", key);
				if (!this.transition.supported) {
					this.setFocus();
				}
			},

			/**
			 * Bind events to elements
			 *
			 * @param  {Object}   el       HTML Object
			 * @param  {Event}    event    Event to attach to element
			 * @param  {Function} fn       Callback function
			 *
			 * @return {undefined}
			 */
			bind : function (el, event, fn) {
				if (typeof el.addEventListener === "function") {
					el.addEventListener(event, fn, false);
				} else if (el.attachEvent) {
					el.attachEvent("on" + event, fn);
				}
			},

			/**
			 * Use alertify as the global error handler (using window.onerror)
			 *
			 * @return {boolean} success
			 */
			handleErrors : function () {
				if (typeof global.onerror !== "undefined") {
					var self = this;
					global.onerror = function (msg, url, line) {
						self.error("[" + msg + " on line " + line + " of " + url + "]", 0);
					};
					return true;
				} else {
					return false;
				}
			},

			/**
			 * Append button HTML strings
			 *
			 * @param {String} secondary    The secondary button HTML string
			 * @param {String} primary      The primary button HTML string
			 *
			 * @return {String}             The appended button HTML strings
			 */
			appendButtons : function (secondary, primary) {
				return this.buttonReverse ? primary + secondary : secondary + primary;
			},

			/**
			 * Build the proper message box
			 *
			 * @param  {Object} item    Current object in the queue
			 *
			 * @return {String}         An HTML string of the message box
			 */
			build : function (item) {
				var html    = "",
				    type    = item.type,
				    message = item.message,
				    css     = item.cssClass || "";

				html += "<div class=\"alertify-dialog\">";
				html += "<a id=\"alertify-resetFocusBack\" class=\"alertify-resetFocus\" href=\"#\">Reset Focus</a>";

				if (_alertify.buttonFocus === "none") html += "<a href=\"#\" id=\"alertify-noneFocus\" class=\"alertify-hidden\"></a>";

				// doens't require an actual form
				if (type === "prompt") html += "<div id=\"alertify-form\">";

				html += "<article class=\"alertify-inner\">";
				html += dialogs.message.replace("{{message}}", message);

				if (type === "prompt") html += dialogs.input;

				html += dialogs.buttons.holder;
				html += "</article>";

				if (type === "prompt") html += "</div>";

				html += "<a id=\"alertify-resetFocus\" class=\"alertify-resetFocus\" href=\"#\">Reset Focus</a>";
				html += "</div>";

				switch (type) {
				case "confirm":
					html = html.replace("{{buttons}}", this.appendButtons(dialogs.buttons.cancel, dialogs.buttons.ok));
					html = html.replace("{{ok}}", this.labels.ok).replace("{{cancel}}", this.labels.cancel);
					break;
				case "prompt":
					html = html.replace("{{buttons}}", this.appendButtons(dialogs.buttons.cancel, dialogs.buttons.submit));
					html = html.replace("{{ok}}", this.labels.ok).replace("{{cancel}}", this.labels.cancel);
					break;
				case "alert":
					html = html.replace("{{buttons}}", dialogs.buttons.ok);
					html = html.replace("{{ok}}", this.labels.ok);
					break;
				default:
					break;
				}

				elDialog.className = "alertify alertify-" + type + " " + css;
				elCover.className  = "alertify-cover";
				return html;
			},

			/**
			 * Close the log messages
			 *
			 * @param  {Object} elem    HTML Element of log message to close
			 * @param  {Number} wait    [optional] Time (in ms) to wait before automatically hiding the message, if 0 never hide
			 *
			 * @return {undefined}
			 */
			close : function (elem, wait) {
				// Unary Plus: +"2" === 2
				var timer = (wait && !isNaN(wait)) ? +wait : this.delay,
				    self  = this,
				    hideElement, transitionDone;

				// set click event on log messages
				this.bind(elem, "click", function () {
					hideElement(elem);
				});
				// Hide the dialog box after transition
				// This ensure it doens't block any element from being clicked
				transitionDone = function (event) {
					event.stopPropagation();
					// unbind event so function only gets called once
					self.unbind(this, self.transition.type, transitionDone);
					// remove log message
					elLog.removeChild(this);
					if (!elLog.hasChildNodes()) elLog.className += " alertify-logs-hidden";
				};
				// this sets the hide class to transition out
				// or removes the child if css transitions aren't supported
				hideElement = function (el) {
					// ensure element exists
					if (typeof el !== "undefined" && el.parentNode === elLog) {
						// whether CSS transition exists
						if (self.transition.supported) {
							self.bind(el, self.transition.type, transitionDone);
							el.className += " alertify-log-hide";
						} else {
							elLog.removeChild(el);
							if (!elLog.hasChildNodes()) elLog.className += " alertify-logs-hidden";
						}
					}
				};
				// never close (until click) if wait is set to 0
				if (wait === 0) return;
				// set timeout to auto close the log message
				setTimeout(function () { hideElement(elem); }, timer);
			},

			/**
			 * Create a dialog box
			 *
			 * @param  {String}   message        The message passed from the callee
			 * @param  {String}   type           Type of dialog to create
			 * @param  {Function} fn             [Optional] Callback function
			 * @param  {String}   placeholder    [Optional] Default value for prompt input field
			 * @param  {String}   cssClass       [Optional] Class(es) to append to dialog box
			 *
			 * @return {Object}
			 */
			dialog : function (message, type, fn, placeholder, cssClass) {
				// set the current active element
				// this allows the keyboard focus to be resetted
				// after the dialog box is closed
				elCallee = document.activeElement;
				// check to ensure the alertify dialog element
				// has been successfully created
				var check = function () {
					if ((elLog && elLog.scrollTop !== null) && (elCover && elCover.scrollTop !== null)) return;
					else check();
				};
				// error catching
				if (typeof message !== "string") throw new Error("message must be a string");
				if (typeof type !== "string") throw new Error("type must be a string");
				if (typeof fn !== "undefined" && typeof fn !== "function") throw new Error("fn must be a function");
				// initialize alertify if it hasn't already been done
				this.init();
				check();

				queue.push({ type: type, message: message, callback: fn, placeholder: placeholder, cssClass: cssClass });
				if (!isopen) this.setup();

				return this;
			},

			/**
			 * Extend the log method to create custom methods
			 *
			 * @param  {String} type    Custom method name
			 *
			 * @return {Function}
			 */
			extend : function (type) {
				if (typeof type !== "string") throw new Error("extend method must have exactly one parameter");
				return function (message, wait) {
					this.log(message, type, wait);
					return this;
				};
			},

			/**
			 * Hide the dialog and rest to defaults
			 *
			 * @return {undefined}
			 */
			hide : function () {
				var transitionDone,
				    self = this;
				// remove reference from queue
				queue.splice(0,1);
				// if items remaining in the queue
				if (queue.length > 0) this.setup(true);
				else {
					isopen = false;
					// Hide the dialog box after transition
					// This ensure it doens't block any element from being clicked
					transitionDone = function (event) {
						event.stopPropagation();
						// unbind event so function only gets called once
						self.unbind(elDialog, self.transition.type, transitionDone);
					};
					// whether CSS transition exists
					if (this.transition.supported) {
						this.bind(elDialog, this.transition.type, transitionDone);
						elDialog.className = "alertify alertify-hide alertify-hidden";
					} else {
						elDialog.className = "alertify alertify-hide alertify-hidden alertify-isHidden";
					}
					elCover.className  = "alertify-cover alertify-cover-hidden";
					// set focus to the last element or body
					// after the dialog is closed
					elCallee.focus();
				}
			},

			/**
			 * Initialize Alertify
			 * Create the 2 main elements
			 *
			 * @return {undefined}
			 */
			init : function () {
				// ensure legacy browsers support html5 tags
				document.createElement("nav");
				document.createElement("article");
				document.createElement("section");
				// cover
				if ($("alertify-cover") == null) {
					elCover = document.createElement("div");
					elCover.setAttribute("id", "alertify-cover");
					elCover.className = "alertify-cover alertify-cover-hidden";
					document.body.appendChild(elCover);
				}
				// main element
				if ($("alertify") == null) {
					isopen = false;
					queue = [];
					elDialog = document.createElement("section");
					elDialog.setAttribute("id", "alertify");
					elDialog.className = "alertify alertify-hidden";
					document.body.appendChild(elDialog);
				}
				// log element
				if ($("alertify-logs") == null) {
					elLog = document.createElement("section");
					elLog.setAttribute("id", "alertify-logs");
					elLog.className = "alertify-logs alertify-logs-hidden";
					document.body.appendChild(elLog);
				}
				// set tabindex attribute on body element
				// this allows script to give it focus
				// after the dialog is closed
				document.body.setAttribute("tabindex", "0");
				// set transition type
				this.transition = getTransitionEvent();
			},

			/**
			 * Show a new log message box
			 *
			 * @param  {String} message    The message passed from the callee
			 * @param  {String} type       [Optional] Optional type of log message
			 * @param  {Number} wait       [Optional] Time (in ms) to wait before auto-hiding the log
			 *
			 * @return {Object}
			 */
			log : function (message, type, wait, click) {
				// check to ensure the alertify dialog element
				// has been successfully created
				var check = function () {
					if (elLog && elLog.scrollTop !== null) return;
					else check();
				};
				// initialize alertify if it hasn't already been done
				this.init();
				check();

				elLog.className = "alertify-logs";
				this.notify(message, type, wait, click);
				return this;
			},

			/**
			 * Add new log message
			 * If a type is passed, a class name "alertify-log-{type}" will get added.
			 * This allows for custom look and feel for various types of notifications.
			 *
			 * @param  {String} message    The message passed from the callee
			 * @param  {String} type       [Optional] Type of log message
			 * @param  {Number} wait       [Optional] Time (in ms) to wait before auto-hiding
			 *
			 * @return {undefined}
			 */
			notify : function (message, type, wait, click) {
				var log = document.createElement("article");
				log.className = "alertify-log" + ((typeof type === "string" && type !== "") ? " alertify-log-" + type : "");
				log.innerHTML = message;
                // Add the click handler, if specified.
                if("function" === typeof click) {
                    this.bind(log, "click", click);
                }
				// append child
				elLog.appendChild(log);
				// triggers the CSS animation
				setTimeout(function() { log.className = log.className + " alertify-log-show"; }, 50);
				this.close(log, wait);
			},

			/**
			 * Set properties
			 *
			 * @param {Object} args     Passing parameters
			 *
			 * @return {undefined}
			 */
			set : function (args) {
				var k;
				// error catching
				if (typeof args !== "object" && args instanceof Array) throw new Error("args must be an object");
				// set parameters
				for (k in args) {
					if (args.hasOwnProperty(k)) {
						this[k] = args[k];
					}
				}
			},

			/**
			 * Common place to set focus to proper element
			 *
			 * @return {undefined}
			 */
			setFocus : function () {
				if (input) {
					input.focus();
					input.select();
				}
				else btnFocus.focus();
			},

			/**
			 * Initiate all the required pieces for the dialog box
			 *
			 * @return {undefined}
			 */
			setup : function (fromQueue) {
				var item = queue[0],
				    self = this,
				    transitionDone;

				// dialog is open
				isopen = true;
				// Set button focus after transition
				transitionDone = function (event) {
					event.stopPropagation();
					self.setFocus();
					// unbind event so function only gets called once
					self.unbind(elDialog, self.transition.type, transitionDone);
				};
				// whether CSS transition exists
				if (this.transition.supported && !fromQueue) {
					this.bind(elDialog, this.transition.type, transitionDone);
				}
				// build the proper dialog HTML
				elDialog.innerHTML = this.build(item);
				// assign all the common elements
				btnReset  = $("alertify-resetFocus");
				btnResetBack  = $("alertify-resetFocusBack");
				btnOK     = $("alertify-ok")     || undefined;
				btnCancel = $("alertify-cancel") || undefined;
				btnFocus  = (_alertify.buttonFocus === "cancel") ? btnCancel : ((_alertify.buttonFocus === "none") ? $("alertify-noneFocus") : btnOK);
				input     = $("alertify-text")   || undefined;
				form      = $("alertify-form")   || undefined;
				// add placeholder value to the input field
				if (typeof item.placeholder === "string" && item.placeholder !== "") input.value = item.placeholder;
				if (fromQueue) this.setFocus();
				this.addListeners(item.callback);
			},

			/**
			 * Unbind events to elements
			 *
			 * @param  {Object}   el       HTML Object
			 * @param  {Event}    event    Event to detach to element
			 * @param  {Function} fn       Callback function
			 *
			 * @return {undefined}
			 */
			unbind : function (el, event, fn) {
				if (typeof el.removeEventListener === "function") {
					el.removeEventListener(event, fn, false);
				} else if (el.detachEvent) {
					el.detachEvent("on" + event, fn);
				}
			}
		};

		return {
			alert   : function (message, fn, cssClass) { _alertify.dialog(message, "alert", fn, "", cssClass); return this; },
			confirm : function (message, fn, cssClass) { _alertify.dialog(message, "confirm", fn, "", cssClass); return this; },
			extend  : _alertify.extend,
			init    : _alertify.init,
			log     : function (message, type, wait, click) { _alertify.log(message, type, wait, click); return this; },
			prompt  : function (message, fn, placeholder, cssClass) { _alertify.dialog(message, "prompt", fn, placeholder, cssClass); return this; },
			success : function (message, wait, click) { _alertify.log(message, "success", wait, click); return this; },
			error   : function (message, wait, click) { _alertify.log(message, "error", wait, click); return this; },
			set     : function (args) { _alertify.set(args); },
			labels  : _alertify.labels,
			debug   : _alertify.handleErrors
		};
	};

	// AMD and window support
	if (typeof define === "function") {
		define([], function () { return new Alertify(); });
	} else if (typeof global.alertify === "undefined") {
		global.alertify = new Alertify();
	}

}(this));

});

require.register("app.js", function(exports, require, module) {
/** @jsx React.DOM */

/* TODO
 * 
 * - All count change, when prospect is archived
 * - When is list is chaanged from all and then returned to All prospects take a long     time to load
 * - Fix pagination issues
 *
 * - Parallelize Workers
 * - Scale up google scrape to hundreds of workers (heroku)
 *
 * - Company Shortcuts 
 * - Add ability to switch accounts for admins
 * - Add email uneditable email fields
 */

var Parse = require("../lib/parse-require.min.js")
var MouseTrap = require('../lib/mousetrap.min.js')
var Headhesive = require('../lib/headhesive.min.js')
var SignUp = require('./signup.jsx');
var Login = require('./login.jsx');
var LandingPage = require('./landing_page_concept.jsx');
var SocialFeed = require('./social_feed.jsx');

var Home = React.createClass({displayName: 'Home',
  getInitialState: function() {
    // num_of_pages
    console.log(this.props)
    return {prospects: [] , 
            currentPage: 1, 
            pages: 1, 
            count:"~", 
            prospectType:'Prospect', 
            //selectedScreen:'Prospects'}
            currentUser: JSON.parse(localStorage.currentUser),
            selectedScreen: this.props.selectedScreen}
  },

  componentDidUpdate: function() {
    currentUser = JSON.parse(localStorage.currentUser)
    days = moment().diff(moment(currentUser.createdAt),'days')
    if(days > 14 && currentUser.accountType == 'trial') {
      $('#upgradePlanModal').modal( {
        backdrop: 'static',
        keyboard: false
      })
    }
  },

  componentWillMount: function(){
    //console.debug('WILL MOUNT')
    checkAuth()
    var thiss = this;
    //console.debug(this.state.currentUser)
    $.ajax({
      url:'https://api.parse.com/1/classes/_User/'+thiss.state.currentUser.objectId,
      headers: appConfig.headers,
      success: function(res) {
        //console.debug('LOL')
        // Number of Prospects for user
        // Number of Lists
        // Number of Emails found
        localStorage.currentUser = JSON.stringify(res)
        console.log(res)
        Intercom('boot', {
          app_id: 'd37c2de5ffe27d69b877645351490517333437bf',
          email: res.email,
          created_at: 1234567890,
          name: 'John Doe',
          user_id: 'lol'
        });
      },
      error: function(err) {
        console.debug('error')
      }
    });
    // Intercom
    // Mixpanel
  },


  toggleScreen: function(e) {
    e.preventDefault()
    this.setState({selectedScreen : $(e.target).text().trim()})
  },

  logout: function() {
    localStorage.clear()
    location.href = "#get_started"
  },

  listDropdown: function() {
    console.log('dropdown')
    //$('.dropdown-menu').dropdown()
    $('.prospect-list-select').css('border-bottom-right-radius','0px')
    $('.prospect-list-select').css('border-bottom-left-radius','0px')
      
    $('.list-select-dropdown').css('border-top-left-radius','0px')
    $('.list-select-dropdown').css('border-top-right-radius','0px')
  },

  selectChange : function() {

  },

  stripeCheckout: function() {
    /*
    handler.open({
      name: 'Customero',
      description: 'Get 900 free email credits!',
      amount: 0,
      panelLabel: "Start Your Free Trial!",
      opened: function() {

      },
      closed: function() {
        console.log("closed")
        //location.reload()
      }
    });
    */
  },

  componentDidMount: function() {
    // Credit Card Verified Check
    localStorage.selectedProspects = "[]"
    currentUser = JSON.parse(localStorage.currentUser)
    if(!currentUser.creditCardVerified)
      this.stripeCheckout()
    //console.debug('DID MOUNT')
    currentUser = JSON.parse(localStorage.currentUser)
    days = moment().diff(moment(currentUser.createdAt),'days')
    if(days > 14 && currentUser.accountType == 'trial') {
      $('#upgradePlanModal').modal( {
        backdrop: 'static',
        keyboard: false
      })
    }
  },

  render: function() {
    //console.debug('APP RENDER')
    prospects = "choose btn btn-primary "
    companyProspects = "choose btn btn-primary "
    campaigns = "choose btn btn-primary "
    signals = "choose btn btn-primary "

    switch (this.state.selectedScreen) {
      case 'Prospects':
        currentScreen = React.createElement(Prospects, {listClassName: 'ProspectList', 
                                   className: 'Prospect'}
                                   )
        //currentScreen = <Prospects><ProspectRow /></Prospects>
        prospects = "choose btn btn-primary app-active"
        location.href= "#prospects"
        break;
      case 'Companies':
        currentScreen = React.createElement(Prospects, {listClassName: 'CompanyProspectList', 
                                   className: 'CompanyProspect'}
                        )
                                    // paginationLimit
                                    // Add Lists
                                    // Adding Customizable Rows
                                    // Make Editable For NoSQL DataBases
        location.href= "#companies"
        companyProspects = "choose btn btn-primary app-active"
        break;
      case 'Mining Jobs':
        currentScreen = React.createElement(MiningJob, null)
        break;
      case 'Analytics':
        currentScreen = React.createElement(Analytics, null)
        break;
      case 'Campaigns':
        currentScreen = React.createElement(Campaigns, null)
        campaigns = "choose btn btn-primary app-active"
        location.href= "#campaigns"
        break;
      case 'Signals':
        currentScreen = React.createElement(Signals, null)
        signals = "choose btn btn-primary app-active"
        location.href= "#signals"
        break;
      case 'Strategies':
        currentScreen = React.createElement(Signals, null)
        signals = "choose btn btn-primary app-active"
        location.href= "#strategies"
        break;
      case 'Settings':
        currentScreen = React.createElement(Settings, null)
        break;
    }

    if(this.state.currentUser.accountType != "Staff"){
      signals = "dissappear"
      campaigns = "dissappear"
      if(companyProspects == "choose btn btn-primary app-active") {
        companyProspects = "choose btn btn-primary app-active right-btn-rounded"
      } else {
        companyProspects = "choose btn btn-primary right-btn-rounded"
      }
      if(prospects == "choose btn btn-primary app-active") {
        prospects = "choose btn btn-primary app-active left-btn-rounded"
      } else {
        prospects = "choose btn btn-primary left-btn-rounded"
      }
    }
      
    currentUser = JSON.parse(localStorage.currentUser)
    daysLeft = moment().diff(moment(currentUser.createdAt),'days')
    daysLeft = (daysLeft > 14) ? "" : (14 - daysLeft)+" days left. "

    if(currentUser.accountType != "trial")
      upgradeBtn = React.createElement("a", {href: "javascript:", 
            style: {marginTop:0, marginRight:10,
                    backgroundImage: 'linear-gradient(180deg, #0096ff 0%, #005dff 100%)' , backgroundImage: 'linear-gradient(#8add6d, #60b044)'}, 
            className: "btn btn-success btn-xs", 
            onClick: this.upgradePlanModal}, 
            daysLeft+"Upgrade Today!"
          )
    else
      upgradeBtn = ""
    return (
      React.createElement("div", null, 
      React.createElement("br", null), 
      React.createElement("br", null), 
      React.createElement("div", {className: "container"}, 
        React.createElement("h1", {style: {fontWeight:'bold',display:'inline',fontWeight:'100',color:'#1ca3fd'}}, 
          React.createElement("img", {src: "build/img/network.png", 
            style: { height:32,
              marginRight:5, }}
          ), 
          React.createElement("span", {style: {fontWeight:'bold',fontSize:32,fontFamily:'Proxima-Nova'}}, "Customero",  
            React.createElement("h6", {className: "beta-label"}, "BETA")
          ), 

          upgradeBtn
        ), 
      React.createElement("span", {style: {float:'right',display:'none'}}, 
        React.createElement("img", {src: "build/img/user.png", style: {height:'40px',width:'40px',padding:'2px',marginTop:'5px',borderRadius:'23px',display:'inline'}, className: "thumbnail"}), "   ",  
        React.createElement("h6", {style: {marginTop:'20px',float:'right',display:'inline'}}, "Welcome ")
      ), 
      React.createElement("span", {style: {float:'right', marginRight:'0px'}}, 
        React.createElement("h6", {style: {marginTop:'20px',float:'right',display:'none',marginRight:'10px'}}, React.createElement("a", {href: "#pricing", style: {color:'#1ca3fd'}}, "Pricing")), 
          React.createElement("a", {href: "javascript:", 
            style: {marginTop:15, float:'right',marginRight:10,
                    backgroundImage: 'linear-gradient(180deg, #0096ff 0%, #005dff 100%)' , backgroundImage: 'linear-gradient(#8add6d, #60b044)'}, 
            className: "btn btn-success btn-xs", 
            onClick: this.downloadSocialProspecter}, 
            React.createElement("i", {className: "fa fa-download"}), "  " + ' ' +
            "Download Chrome Social Prospecter"
          ), 
        React.createElement("h6", {style: {marginTop:'20px',float:'right',display:'inline', marginRight:10}}, React.createElement("a", {href: "javascript:", onClick: this.logout, style: {color:'#1ca3fd'}}, 
            React.createElement("i", {className: "fa fa-sign-out"}), 
            "Logout")), 
          React.createElement("h6", {style: {marginTop:'20px',float:'right',display:'inline', marginRight:'10px'}}, " ", React.createElement("a", {href: "http://resources.customerohq.com/v1.0/discuss", style: {color:'#1ca3fd'}}, 

              React.createElement("i", {className: "fa fa-question-circle"}), 
              React.createElement("span", {style: {paddingLeft:2}}, 'Support')
        ), " "), 
        React.createElement("h6", {style: {marginTop:'20px',float:'right',display:'inline', marginRight:'10px'}}, 
          React.createElement("a", {href: "http://resources.customerohq.com/v1.0/docs", style: {color:'#1ca3fd'}}, 
              React.createElement("i", {className: "fa fa-book"}), 
              React.createElement("span", {style: {paddingLeft:2}}, "Resources")
          ), " "), 
          React.createElement("h6", {style: {marginTop:'20px',float:'right',display:'inline', marginRight:'20px',display:'none'}}, 
            React.createElement("a", {href: "javascript:", style: {color:'#1ca3fd'}}, 
              React.createElement("i", {className: "fa fa-bell"}), 
              React.createElement("span", {style: {paddingLeft:2}}, "Notifications "), 
              React.createElement("div", {className: "label notification-badge"}, "0")
          )), 
          React.createElement("h6", {style: {marginTop:'20px',float:'right',display:'inline', marginRight:'20px',display:'none'}}, 
            React.createElement("a", {href: "javascript:", style: {color:'#1ca3fd'}}, 
              React.createElement("i", {className: "fa fa-cloud-download"}), 
              React.createElement("span", {style: {paddingLeft:2}}, "Mining Jobs "), 
              React.createElement("div", {className: "label notification-badge"}, "0")
          ))

      ), 
      React.createElement("br", null), 
      React.createElement("br", null), 
        React.createElement("div", {className: "panel panel-default"}, 
        React.createElement("div", {id: "navbar", className: "panel-heading"}, 

          React.createElement("div", {className: "btn-group col-md-offset-4"}, 
            React.createElement("a", {href: "javascript:", className: signals, style: {display:'block'}, onClick: this.toggleScreen}, 
                React.createElement("i", {className: "fa fa-line-chart"}), " Strategies"
            ), 
            React.createElement("a", {href: "javascript:", className: prospects, onClick: this.toggleScreen}, 
                React.createElement("i", {className: "fa fa-user"}), " Prospects"
            ), 
            React.createElement("a", {href: "javascript:", className: "choose btn btn-primary", style: {display:'none'}, onClick: this.toggleScreen}, 
                React.createElement("i", {className: "fa fa-bar-chart-o"}), " Analytics"
            ), 
            React.createElement("a", {href: "javascript:", className: "choose btn btn-primary", 
                  style: {width:162,display:'none'}, 
                  onClick: this.toggleScreen}, 
                React.createElement("i", {className: "fa fa-tasks"}), " Mining Jobs  ", 
                React.createElement("span", {className: "label label-default"}, "BETA")
            ), 
            React.createElement("a", {href: "javascript:", className: companyProspects, onClick: this.toggleScreen}, 
                React.createElement("i", {className: "fa fa-building"}), " Companies"
            ), 
            React.createElement("a", {href: "javascript:", className: campaigns, style: {display:'block'}, onClick: this.toggleScreen}, 
                React.createElement("i", {className: "fa fa-envelope"}), " Campaigns"
            )
          )
        ), 

          currentScreen

        )
      ), 
      React.createElement(UpgradePlanModal, null)
      )
    );
  },

  upgradePlanModal: function() {
    $('#upgradePlanModal').modal()
  },
  
  downloadSocialProspecter: function() {
    window.open('https://chrome.google.com/webstore/detail/customero-prospecter/ofcalkjbogaiipekcocdefjenclioeci')
  },

  deleteProspect: function(objectId, endpoint) {
    var filtered = _.filter(this.state.prospects, function(item) {
       return item.objectId != objectId
    });
    this.setState({prospects: filtered})

    $.ajax({
      url:'https://api.parse.com/1/classes/'+endpoint+'/'+objectId,
      type:'DELETE',
      headers: parse_headers,
      success: function(res) {
        console.log(res)
      },
      error: function(err) {
      }
    });
  }
});

});

require.register("auth", function(exports, require, module) {
/* Auth Redirects */

function checkAuth(){
  //currentUser = localStorage.getItem('Parse/N85QOkteEEQkuZVJKAvt8MVes0sjG6qNpEGqQFVJ/currentUser')
  currentUser = localStorage.getItem('currentUser')
  if (currentUser) {
    if(window.location.hash != "#free_trial")
      lol = 4

      //location.href = "#"            
  } else {
    console.log(window.location.hash)
    if(window.location.hash != "#free_trial" || window.location.hash != "#login" || window.location.hash != "#signup" || window.location.hash != "#product/features" || window.location.hash != "#services"){
      //location.href = "#get_started"
    } else {
      console.log('ELSE')
    }
      //location.href = "#signup"
  }
}
/*
module.exports = function(){
  //currentUser = localStorage.getItem('Parse/N85QOkteEEQkuZVJKAvt8MVes0sjG6qNpEGqQFVJ/currentUser')
  currentUser = localStorage.getItem('currentUser')
  if (currentUser) {
    location.href = "#"             // Feed
  } else {
    if(window.location.hash != "#login" || window.location.href=="#signup")
      location.href = "#get_started"
      //location.href = "#signup"
  }
}
*/

});

;require.register("bootstrap-tagsinput", function(exports, require, module) {
(function ($) {
  "use strict";

  var defaultOptions = {
    tagClass: function(item) {
      return 'label label-info';
    },
    itemValue: function(item) {
      return item ? item.toString() : item;
    },
    itemText: function(item) {
      return this.itemValue(item);
    },
    freeInput: true,
    addOnBlur: true,
    maxTags: undefined,
    maxChars: undefined,
    confirmKeys: [13, 44],
    onTagExists: function(item, $tag) {
      $tag.hide().fadeIn();
    },
    trimValue: false,
    allowDuplicates: false
  };

  /**
   * Constructor function
   */
  function TagsInput(element, options) {
    this.itemsArray = [];

    this.$element = $(element);
    this.$element.hide();

    this.isSelect = (element.tagName === 'SELECT');
    this.multiple = (this.isSelect && element.hasAttribute('multiple'));
    this.objectItems = options && options.itemValue;
    this.placeholderText = element.hasAttribute('placeholder') ? this.$element.attr('placeholder') : '';
    this.inputSize = Math.max(1, this.placeholderText.length);

    this.$container = $('<div class="bootstrap-tagsinput"></div>');
    this.$input = $('<input type="text" placeholder="' + this.placeholderText + '"/>').appendTo(this.$container);

    this.$element.after(this.$container);

    var inputWidth = (this.inputSize < 3 ? 3 : this.inputSize) + "em";
    this.$input.get(0).style.cssText = "width: " + inputWidth + " !important;";
    this.build(options);
  }

  TagsInput.prototype = {
    constructor: TagsInput,

    /**
     * Adds the given item as a new tag. Pass true to dontPushVal to prevent
     * updating the elements val()
     */
    add: function(item, dontPushVal) {
      var self = this;

      if (self.options.maxTags && self.itemsArray.length >= self.options.maxTags)
        return;

      // Ignore falsey values, except false
      if (item !== false && !item)
        return;

      // Trim value
      if (typeof item === "string" && self.options.trimValue) {
        item = $.trim(item);
      }

      // Throw an error when trying to add an object while the itemValue option was not set
      if (typeof item === "object" && !self.objectItems)
        throw("Can't add objects when itemValue option is not set");

      // Ignore strings only containg whitespace
      if (item.toString().match(/^\s*$/))
        return;

      // If SELECT but not multiple, remove current tag
      if (self.isSelect && !self.multiple && self.itemsArray.length > 0)
        self.remove(self.itemsArray[0]);

      if (typeof item === "string" && this.$element[0].tagName === 'INPUT') {
        var items = item.split(',');
        if (items.length > 1) {
          for (var i = 0; i < items.length; i++) {
            this.add(items[i], true);
          }

          if (!dontPushVal)
            self.pushVal();
          return;
        }
      }

      var itemValue = self.options.itemValue(item),
          itemText = self.options.itemText(item),
          tagClass = self.options.tagClass(item);

      // Ignore items allready added
      var existing = $.grep(self.itemsArray, function(item) { return self.options.itemValue(item) === itemValue; } )[0];
      if (existing && !self.options.allowDuplicates) {
        // Invoke onTagExists
        if (self.options.onTagExists) {
          var $existingTag = $(".tag", self.$container).filter(function() { return $(this).data("item") === existing; });
          self.options.onTagExists(item, $existingTag);
        }
        return;
      }

      // if length greater than limit
      if (self.items().toString().length + item.length + 1 > self.options.maxInputLength)
        return;

      // raise beforeItemAdd arg
      var beforeItemAddEvent = $.Event('beforeItemAdd', { item: item, cancel: false });
      self.$element.trigger(beforeItemAddEvent);
      if (beforeItemAddEvent.cancel)
        return;

      // register item in internal array and map
      self.itemsArray.push(item);

      // add a tag element
      var $tag = $('<span class="tag ' + htmlEncode(tagClass) + '">' + htmlEncode(itemText) + '<span data-role="remove"></span></span>');
      $tag.data('item', item);
      self.findInputWrapper().before($tag);
      $tag.after(' ');

      // add <option /> if item represents a value not present in one of the <select />'s options
      if (self.isSelect && !$('option[value="' + encodeURIComponent(itemValue) + '"]',self.$element)[0]) {
        var $option = $('<option selected>' + htmlEncode(itemText) + '</option>');
        $option.data('item', item);
        $option.attr('value', itemValue);
        self.$element.append($option);
      }

      if (!dontPushVal)
        self.pushVal();

      // Add class when reached maxTags
      if (self.options.maxTags === self.itemsArray.length || self.items().toString().length === self.options.maxInputLength)
        self.$container.addClass('bootstrap-tagsinput-max');

      self.$element.trigger($.Event('itemAdded', { item: item }));
    },

    /**
     * Removes the given item. Pass true to dontPushVal to prevent updating the
     * elements val()
     */
    remove: function(item, dontPushVal) {
      var self = this;

      if (self.objectItems) {
        if (typeof item === "object")
          item = $.grep(self.itemsArray, function(other) { return self.options.itemValue(other) ==  self.options.itemValue(item); } );
        else
          item = $.grep(self.itemsArray, function(other) { return self.options.itemValue(other) ==  item; } );

        item = item[item.length-1];
      }

      if (item) {
        var beforeItemRemoveEvent = $.Event('beforeItemRemove', { item: item, cancel: false });
        self.$element.trigger(beforeItemRemoveEvent);
        if (beforeItemRemoveEvent.cancel)
          return;

        $('.tag', self.$container).filter(function() { return $(this).data('item') === item; }).remove();
        $('option', self.$element).filter(function() { return $(this).data('item') === item; }).remove();
        if($.inArray(item, self.itemsArray) !== -1)
          self.itemsArray.splice($.inArray(item, self.itemsArray), 1);
      }

      if (!dontPushVal)
        self.pushVal();

      // Remove class when reached maxTags
      if (self.options.maxTags > self.itemsArray.length)
        self.$container.removeClass('bootstrap-tagsinput-max');

      self.$element.trigger($.Event('itemRemoved',  { item: item }));
    },

    /**
     * Removes all items
     */
    removeAll: function() {
      var self = this;

      $('.tag', self.$container).remove();
      $('option', self.$element).remove();

      while(self.itemsArray.length > 0)
        self.itemsArray.pop();

      self.pushVal();
    },

    /**
     * Refreshes the tags so they match the text/value of their corresponding
     * item.
     */
    refresh: function() {
      var self = this;
      $('.tag', self.$container).each(function() {
        var $tag = $(this),
            item = $tag.data('item'),
            itemValue = self.options.itemValue(item),
            itemText = self.options.itemText(item),
            tagClass = self.options.tagClass(item);

          // Update tag's class and inner text
          $tag.attr('class', null);
          $tag.addClass('tag ' + htmlEncode(tagClass));
          $tag.contents().filter(function() {
            return this.nodeType == 3;
          })[0].nodeValue = htmlEncode(itemText);

          if (self.isSelect) {
            var option = $('option', self.$element).filter(function() { return $(this).data('item') === item; });
            option.attr('value', itemValue);
          }
      });
    },

    /**
     * Returns the items added as tags
     */
    items: function() {
      return this.itemsArray;
    },

    /**
     * Assembly value by retrieving the value of each item, and set it on the
     * element.
     */
    pushVal: function() {
      var self = this,
          val = $.map(self.items(), function(item) {
            return self.options.itemValue(item).toString();
          });

      self.$element.val(val, true).trigger('change');
    },

    /**
     * Initializes the tags input behaviour on the element
     */
    build: function(options) {
      var self = this;

      self.options = $.extend({}, defaultOptions, options);
      // When itemValue is set, freeInput should always be false
      if (self.objectItems)
        self.options.freeInput = false;

      makeOptionItemFunction(self.options, 'itemValue');
      makeOptionItemFunction(self.options, 'itemText');
      makeOptionFunction(self.options, 'tagClass');
      
      // Typeahead Bootstrap version 2.3.2
      if (self.options.typeahead) {
        var typeahead = self.options.typeahead || {};

        makeOptionFunction(typeahead, 'source');

        self.$input.typeahead($.extend({}, typeahead, {
          source: function (query, process) {
            function processItems(items) {
              var texts = [];

              for (var i = 0; i < items.length; i++) {
                var text = self.options.itemText(items[i]);
                map[text] = items[i];
                texts.push(text);
              }
              process(texts);
            }

            this.map = {};
            var map = this.map,
                data = typeahead.source(query);

            if ($.isFunction(data.success)) {
              // support for Angular callbacks
              data.success(processItems);
            } else if ($.isFunction(data.then)) {
              // support for Angular promises
              data.then(processItems);
            } else {
              // support for functions and jquery promises
              $.when(data)
               .then(processItems);
            }
          },
          updater: function (text) {
            self.add(this.map[text]);
          },
          matcher: function (text) {
            return (text.toLowerCase().indexOf(this.query.trim().toLowerCase()) !== -1);
          },
          sorter: function (texts) {
            return texts.sort();
          },
          highlighter: function (text) {
            var regex = new RegExp( '(' + this.query + ')', 'gi' );
            return text.replace( regex, "<strong>$1</strong>" );
          }
        }));
      }

      // typeahead.js
      if (self.options.typeaheadjs) {
          var typeaheadjs = self.options.typeaheadjs || {};
          
          self.$input.typeahead(null, typeaheadjs).on('typeahead:selected', $.proxy(function (obj, datum) {
            if (typeaheadjs.valueKey)
              self.add(datum[typeaheadjs.valueKey]);
            else
              self.add(datum);
            self.$input.typeahead('val', '');
          }, self));
      }

      self.$container.on('click', $.proxy(function(event) {
        if (! self.$element.attr('disabled')) {
          self.$input.removeAttr('disabled');
        }
        self.$input.focus();
      }, self));

        if (self.options.addOnBlur && self.options.freeInput) {
          self.$input.on('focusout', $.proxy(function(event) {
              // HACK: only process on focusout when no typeahead opened, to
              //       avoid adding the typeahead text as tag
              if ($('.typeahead, .twitter-typeahead', self.$container).length === 0) {
                self.add(self.$input.val());
                self.$input.val('');
              }
          }, self));
        }
        

      self.$container.on('keydown', 'input', $.proxy(function(event) {
        var $input = $(event.target),
            $inputWrapper = self.findInputWrapper();

        if (self.$element.attr('disabled')) {
          self.$input.attr('disabled', 'disabled');
          return;
        }

        switch (event.which) {
          // BACKSPACE
          case 8:
            if (doGetCaretPosition($input[0]) === 0) {
              var prev = $inputWrapper.prev();
              if (prev) {
                self.remove(prev.data('item'));
              }
            }
            break;

          // DELETE
          case 46:
            if (doGetCaretPosition($input[0]) === 0) {
              var next = $inputWrapper.next();
              if (next) {
                self.remove(next.data('item'));
              }
            }
            break;

          // LEFT ARROW
          case 37:
            // Try to move the input before the previous tag
            var $prevTag = $inputWrapper.prev();
            if ($input.val().length === 0 && $prevTag[0]) {
              $prevTag.before($inputWrapper);
              $input.focus();
            }
            break;
          // RIGHT ARROW
          case 39:
            // Try to move the input after the next tag
            var $nextTag = $inputWrapper.next();
            if ($input.val().length === 0 && $nextTag[0]) {
              $nextTag.after($inputWrapper);
              $input.focus();
            }
            break;
         default:
             // ignore
         }

        // Reset internal input's size
        var textLength = $input.val().length,
            wordSpace = Math.ceil(textLength / 5),
            size = textLength + wordSpace + 1;
        $input.attr('size', Math.max(this.inputSize, $input.val().length));
      }, self));

      self.$container.on('keypress', 'input', $.proxy(function(event) {
         var $input = $(event.target);

         if (self.$element.attr('disabled')) {
            self.$input.attr('disabled', 'disabled');
            return;
         }

         var text = $input.val(),
         maxLengthReached = self.options.maxChars && text.length >= self.options.maxChars;
         if (self.options.freeInput && (keyCombinationInList(event, self.options.confirmKeys) || maxLengthReached)) {
            self.add(maxLengthReached ? text.substr(0, self.options.maxChars) : text);
            $input.val('');
            event.preventDefault();
         }

         // Reset internal input's size
         var textLength = $input.val().length,
            wordSpace = Math.ceil(textLength / 5),
            size = textLength + wordSpace + 1;
         $input.attr('size', Math.max(this.inputSize, $input.val().length));
      }, self));

      // Remove icon clicked
      self.$container.on('click', '[data-role=remove]', $.proxy(function(event) {
        if (self.$element.attr('disabled')) {
          return;
        }
        self.remove($(event.target).closest('.tag').data('item'));
      }, self));

      // Only add existing value as tags when using strings as tags
      if (self.options.itemValue === defaultOptions.itemValue) {
        if (self.$element[0].tagName === 'INPUT') {
            self.add(self.$element.val());
        } else {
          $('option', self.$element).each(function() {
            self.add($(this).attr('value'), true);
          });
        }
      }
    },

    /**
     * Removes all tagsinput behaviour and unregsiter all event handlers
     */
    destroy: function() {
      var self = this;

      // Unbind events
      self.$container.off('keypress', 'input');
      self.$container.off('click', '[role=remove]');

      self.$container.remove();
      self.$element.removeData('tagsinput');
      self.$element.show();
    },

    /**
     * Sets focus on the tagsinput
     */
    focus: function() {
      this.$input.focus();
    },

    /**
     * Returns the internal input element
     */
    input: function() {
      return this.$input;
    },

    /**
     * Returns the element which is wrapped around the internal input. This
     * is normally the $container, but typeahead.js moves the $input element.
     */
    findInputWrapper: function() {
      var elt = this.$input[0],
          container = this.$container[0];
      while(elt && elt.parentNode !== container)
        elt = elt.parentNode;

      return $(elt);
    }
  };

  /**
   * Register JQuery plugin
   */
  $.fn.tagsinput = function(arg1, arg2) {
    var results = [];

    this.each(function() {
      var tagsinput = $(this).data('tagsinput');
      // Initialize a new tags input
      if (!tagsinput) {
          tagsinput = new TagsInput(this, arg1);
          $(this).data('tagsinput', tagsinput);
          results.push(tagsinput);

          if (this.tagName === 'SELECT') {
              $('option', $(this)).attr('selected', 'selected');
          }

          // Init tags from $(this).val()
          $(this).val($(this).val());
      } else if (!arg1 && !arg2) {
          // tagsinput already exists
          // no function, trying to init
          results.push(tagsinput);
      } else if(tagsinput[arg1] !== undefined) {
          // Invoke function on existing tags input
          var retVal = tagsinput[arg1](arg2);
          if (retVal !== undefined)
              results.push(retVal);
      }
    });

    if ( typeof arg1 == 'string') {
      // Return the results from the invoked function calls
      return results.length > 1 ? results : results[0];
    } else {
      return results;
    }
  };

  $.fn.tagsinput.Constructor = TagsInput;

  /**
   * Most options support both a string or number as well as a function as
   * option value. This function makes sure that the option with the given
   * key in the given options is wrapped in a function
   */
  function makeOptionItemFunction(options, key) {
    if (typeof options[key] !== 'function') {
      var propertyName = options[key];
      options[key] = function(item) { return item[propertyName]; };
    }
  }
  function makeOptionFunction(options, key) {
    if (typeof options[key] !== 'function') {
      var value = options[key];
      options[key] = function() { return value; };
    }
  }
  /**
   * HtmlEncodes the given value
   */
  var htmlEncodeContainer = $('<div />');
  function htmlEncode(value) {
    if (value) {
      return htmlEncodeContainer.text(value).html();
    } else {
      return '';
    }
  }

  /**
   * Returns the position of the caret in the given input field
   * http://flightschool.acylt.com/devnotes/caret-position-woes/
   */
  function doGetCaretPosition(oField) {
    var iCaretPos = 0;
    if (document.selection) {
      oField.focus ();
      var oSel = document.selection.createRange();
      oSel.moveStart ('character', -oField.value.length);
      iCaretPos = oSel.text.length;
    } else if (oField.selectionStart || oField.selectionStart == '0') {
      iCaretPos = oField.selectionStart;
    }
    return (iCaretPos);
  }

  /**
    * Returns boolean indicates whether user has pressed an expected key combination. 
    * @param object keyPressEvent: JavaScript event object, refer
    *     http://www.w3.org/TR/2003/WD-DOM-Level-3-Events-20030331/ecma-script-binding.html
    * @param object lookupList: expected key combinations, as in:
    *     [13, {which: 188, shiftKey: true}]
    */
  function keyCombinationInList(keyPressEvent, lookupList) {
      var found = false;
      $.each(lookupList, function (index, keyCombination) {
          if (typeof (keyCombination) === 'number' && keyPressEvent.which === keyCombination) {
              found = true;
              return false;
          }

          if (keyPressEvent.which === keyCombination.which) {
              var alt = !keyCombination.hasOwnProperty('altKey') || keyPressEvent.altKey === keyCombination.altKey,
                  shift = !keyCombination.hasOwnProperty('shiftKey') || keyPressEvent.shiftKey === keyCombination.shiftKey,
                  ctrl = !keyCombination.hasOwnProperty('ctrlKey') || keyPressEvent.ctrlKey === keyCombination.ctrlKey;
              if (alt && shift && ctrl) {
                  found = true;
                  return false;
              }
          }
      });

      return found;
  }

  /**
   * Initialize tagsinput behaviour on inputs and selects which have
   * data-role=tagsinput
   */
  $(function() {
    $("input[data-role=tagsinput], select[multiple][data-role=tagsinput]").tagsinput();
  });
})(window.jQuery);

});

require.register("chat", function(exports, require, module) {
var Chat = React.createClass({displayName: 'Chat',
  componentDidMount: function() {
    //(function(d,s){var js,cjs=d.getElementsByTagName(s)[0];js=d.createElement(s); js.src='//chat.center/javascripts/widget.js'; cjs.parentNode.insertBefore(js,cjs);}(document,'script'));
    $(".js-change-state").click()
  },
  render: function() {
    return (
      React.createElement("div", null, 
      React.createElement("iframe", {src: "https://chat.center/influenceriq", style: {height:"400px"}})
    )

    )
  }
})

module.exports = Chat

});

;require.register("checkbox_group", function(exports, require, module) {

var CheckboxGroup = React.createClass({displayName: 'CheckboxGroup',
  render: function() {
    return (
      React.createElement("div", null, 
        "The Checkbox Group", 
        React.createElement("div", {className: "checkbox"}, 
          React.createElement("input", {type: "checkbox", id: "checkbox1"}), React.createElement("label", {htmlFor: "checkbox1"}, " Check me out "), 
          React.createElement("input", {type: "checkbox", id: "checkbox2"}), React.createElement("label", {htmlFor: "checkbox2"}, " Check me out "), 
          React.createElement("input", {type: "checkbox", id: "checkbox3"}), React.createElement("label", {htmlFor: "checkbox3"}, " Check me out "), 
          React.createElement("input", {type: "checkbox", id: "checkbox4"}), React.createElement("label", {htmlFor: "checkbox4"}, " Check me out ")
        )
      )
    )
  }
})

module.exports = CheckboxGroup

});

;require.register("coming_soon", function(exports, require, module) {
var Navbar = require("navbar")

var ComingSoon = React.createClass({displayName: 'ComingSoon',
  render: function () {
    return ( 
            React.createElement("div", {style: {height:"100%"}}, 
              React.createElement(Navbar, null), 
              React.createElement("h1", null, "Coming Soon")
            )
    )
  }
});

module.exports = ComingSoon

});

;require.register("connect", function(exports, require, module) {
var Navbar = require("navbar")

var Connect = React.createClass({displayName: 'Connect',
  twitterLogin: function() {
    console.log("twitter")
    hello('twitter').login()
  },

  soundcloudLogin: function() {
    console.log("soundcloud")
    //hello('soundcloud').login()
    hello('instagram').login().then(function() {
        console.log('You are signed in to Facebook');
    }, function(e) {
        console.log('Signin error: ' + e.error.message);
    });
  },

  componentDidMount: function() {

    hello.on('auth.login', function(auth) {
      console.log(auth)
    })

  },

  render: function() {
    return (
      React.createElement("div", null, 
        React.createElement(Navbar, null), 
        React.createElement("div", {className: "col-md-offset-3 col-md-6", 
            style: {paddingTop:100,textAlign:"center"}}, 
          React.createElement("span", {style: {fontSize:20,fontWeight:100}}, 
            "CONNECT YOUR SOCIAL ACCOUNT"
          ), 
            React.createElement("hr", null), 
          React.createElement("br", null), 
          React.createElement("div", {className: "tile", 
              onClick: this.twitterLogin}, 
            React.createElement("i", {className: "fa fa-twitter", 
                style: {}}), 
            React.createElement("div", {style: {fontSize:12}}, " Twitter ")
          ), 

          React.createElement("div", {className: "tile", 
              onClick: this.soundcloudLogin}, 
            React.createElement("i", {className: "fa fa-soundcloud", 
                style: {}}), 
            React.createElement("div", {style: {fontSize:12}}, " Soundcloud ")
          ), 

          React.createElement("div", {className: "tile"}, 
            React.createElement("i", {className: "fa fa-youtube", 
                style: {}}), 
            React.createElement("div", {style: {fontSize:12}}, " Youtube ")
          ), 

          React.createElement("br", null), 
          React.createElement("br", null), 

          React.createElement("div", {className: "tile"}, 
            React.createElement("i", {className: "fa fa-instagram", 
                style: {}}), 
            React.createElement("div", {style: {fontSize:12}}, " Instagram ")
          ), 

          React.createElement("div", {className: "tile"}, 
            React.createElement("i", {className: "fa fa-pinterest", 
                style: {}}), 
            React.createElement("div", {style: {fontSize:12}}, " Pinterest ")
          ), 

          React.createElement("div", {className: "tile"}, 
            React.createElement("i", {className: "fa fa-vine", 
                style: {}}), 
            React.createElement("div", {style: {fontSize:12}}, " Vine ")
          )
        )
      )
    )
  }
})

module.exports = Connect

});

;require.register("data", function(exports, require, module) {
module.exports = function () {
  return {"0":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/8353a3fc05724cbe45e8c23b347a39e7_0994d458faff1d0b71f0f8e534299335a5765ba4a672ed817669729f6a0a1e9d","1":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/107fc2691bb8b3333ba78a18600fa561_9a832b2e27c2aa8ce6ed12c62fb665939e4de38f30ec9bebd92f813ea677f8c3","2":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/4432a5df98c5ead32ca3ec898e175c90_f93ef0a7ddba9ac960c6a15941a69a124a5d5961fde34455cb7cee6c97f712ba","3":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/229580b716606a4eb2142b1eaaca10e7_2398d5050e191d15ff5cf9eb68cc683690c06d3949345dbf790394437a465c08","4":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/499d8a863d7872d6e239512124af9ddc_771182dc7b6c0801de6e571deed89b437ab122372b547e1f7d8dacae9cb17275","5":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/a9e97a6445a8ac187561310b16b4bbd8_96ce9289fd8e6f2a6bf262b4baf548367ad7f53aac9a9ec1157020465de07e67","6":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/35af508daa4a580806961236bfb743a1_1a4afe2656f8d95e3717751f96a0c6ce6c5b1d25920f4d45e5cfe9bba05de0c8","7":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/a1003503ef5e2254e6694eebbd2b4499_a8cd2caefe691476e3f02351369dc2c07c1a3d6ce0f87b187f58fdf4b20292c5","8":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/01dcb5278f55225b7e9c0cff6aa3d6e6_b40f92b9c5ef3b8c81d478bb70b7a094f076ed59b7d36d7a6401f0fd9d95eacf","9":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/61d79e3c25105099f73668c625ea361c_1d7c1255968258c03d0564e141284b4bddbd2db52091cf8d75cb384b23949390","10":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/ca808450a6222c9b09d5b86924a08fbb_f90e02c1e981e5f6caf8af76fefef7653d0a451da51ba5a22ac0f265874bc6cb","11":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/97de93a99b8a9159dede2b9ff17c7887_3e90df8e7894c0c12963abf2fadb205e44365f58b537f15b677a4a7e9c557bcd","12":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/9bf8404d673c9d6178f23548caa4c9a4_46606dba9df4d10cf282fa7add23e8a87b7f976d0e3a153fad0ff181e1be4e17","13":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/7f3a4754a634fc1e39090c5dd6c46808_42d3294b34c4ac9c6f99f66bc3ad9a195d20e98b09c7579fe341d0cf42f9c93f","14":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/b4bebbfbfbe47e50f435b4c2efe0db0f_181a3119f12fd03b6bb517352c636508497bec61f9078b0e281515efd192b345","15":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/ec1f6190e2b9a80a3f7cf101649ccc63_0026017f4380585a2e540f05936a6f58fe725fe7e8e0378aae98039628c4bdf2","16":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/9dd921f41fa8d4ab29bcc1c45348b5a2_158df8a22c1f1570e8a2c17ab5e30169248030593665fbd8792f5f2f01516290","17":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/b9786c9b56c94caa13e74d59b9a9da48_1f195fbcdf95c0d2618d571e0192ff1be2e4921d88aed8b7b9fd9e1444749271","18":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/aa8577f878858f318858aced5abd037f_cb926a07d0e468660e3569279cc1354aa7243cdc951f970325273993c89e9ee7","19":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/c11b322d8a8007037ee3e3242b260930_2a63c13b315a38b069f38da657b189aad6c7af5941a19859111dfb3c70c94b41","20":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/19b6c3989a808be845718d8af24352ff_a8e72abb2b5772706ac1c79e5cbaf59b3c2f20efb0aca9b93d04ae8a24920967","21":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/f4120970a686a56b4759585808177cc7_8e175e495b1de922ccd9a92a5de97b95433444aca422b3e632c2ea4ed48d3bc9","22":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/aee7e40b2dd4c4c9961323d98249c826_c1c387c714e89d5dfccf06d3fe0fed332992eff877cdbd60bc4e94e7a2ed38ff","23":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/66d18bafff4f9b8d077c107bb73b2912_f8055289eae58fad00cc0f6727b2b5cf0f72b837963351b7ca6250ba4e2632a1","24":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/2da8546c3b6a99b191249ae69207e31a_db86681331d0d2b9850e5596ce7711ac386f4e1469c526934267978af3498338","25":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/5617f7787cdf0176e54c4f13e9ccc54e_da7cc169f46585de72acf5f705cd34a52c688a40dc8aa72ea720d556a7022f72","26":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/f7e2712aa8cfab88c55d1f6c78ef2e45_5c895ca06f40e30369e07b19c64b7bf1fe5be0977e5bbfc0c2212b73ea6e6512","27":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/29ab72c2b97b25c4e3e1c280e3264f80_069b94caad3b14e2bb3b2012a51d94ed8e476f0a3d9a368aac36db9d716a12af","28":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/ee17a7d90c8065a3abcd0a6720b52e66_3b9938c2693e142ba37065de24dabec556a192add4b84b4f29785cea3b74853f","29":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/16f61ebf1810ac333f7c936ce711b28a_35d43f3d1c762b21d629634b4584d0cd95aecdfd9a3087f24a9eb729d134b769","30":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/e318ccc5121cfeb3b99c21d055e6ece9_edc606d4bcd3d76f8e45da96d9dbd651bf0c067a7ca159e1073e3b44b03530c9","31":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/df9c90f2b93a9e488d94fe52725bd798_3b0e3396d9dea866960d8ce6f67af10c8809f154b6831fc278b8ed34390a9f27","32":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/6eee357d121c814a97b6362c4e55526a_cbff4ac439c2054813dea8da8b8f1ec3b5e0c644acf0dc2ae625741e97f0bea0","33":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/560aed1bee8e220f0980190dedb7add6_9ad2de7c6ebfdd724f2a17c85efd5192f8393a477dddf0a0c8c9260e17d5a515","34":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/850f1242ddd6539ad8b27f69908c7f9e_08ffecd2b6d184e7d70ab70abbbbabe7132269250c93dbbdcba7f22e86f0692e","35":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/075c06c481eea429f6cc816697fcbbf8_c55b99be050bdcb1f32c9578cb8e17f6f4d6f200c1f37f528c24fee65a26182a","36":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/028b3110aa60554e7434f1a2473229cf_d15e1c7f00c82755e144773d46bb4e0e964fcfa425a254ca05ac1313fcea3bae","37":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/c3719f85d24bafef64eada64e735ca73_025880c51ff42bd3ff79ba35d456d8cb14b6fbc7ee17ba3b98612e71aa1d74b9","38":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/22356ab6ae4467c44a074a4134bad937_a9909c37e6e23b4343ce19582c9118cfb3748b8977f1db8230aa992d640f1217","39":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/2132e5a2fcd89a54e7c42c5fa0b8ef77_ff0dc46511b150a4b0af9cdf866af2e06ce898d7119b7ab21350e0b3304d8065","40":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/45aaa73b693aeec414b34fd44262ef8f_51c22532abe0b615f0e6e3c0e91cb1a9bca41a6f6c0ec6f33c3693d128fd1755","41":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/57bc2d1a2ab692e38284f3550f58b381_03bd441172001e3c2e5084f3390ee0ca0327b502b0c1dc794c8c8ac2b3d2130e","42":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/4745ad07807ccad97e0726fc7ba18170_48911a727474c0398c3fc701880d623faedc592f16677310f8e8111a25e2be37","43":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/cd1594c62a31c831d124e286b6909700_0cd9d060392c5f5d575f29a8930c55c69a54501c1d7636929682c38e4e069d5e","44":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/1f3db7712313a3bcfe5ff4a99b67fcdf_a66bec0a43179531bce8020aaade3d85967b7c9df54ab2bdf41f12f6cd60d3ef","45":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/2643e008752dbffd17cd7e4cea30bb08_867fd9b76c5342b914bd9b285756ac10cf04e1b3ad8cb6524a2c96d7ab75c07a","46":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/d89fd2959f9efdcf70778801253a4920_97a906684f843e8ea3f3237797adc601c4d20dfcc79e7b6e756630206312fe89","47":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/d0b7922821c73bb34357b9a7bbf2267c_d63a4e4655665268ea92da08063c95f309646f9698125b318b0621487b906ca4","48":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/b76f8da9538eea9eb4d897656f4aed8b_f49ffb97513493d056f42fe316650f1fb507fc1ebe7a04ad8454fd2b58c50ea7","49":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/190285c653fe1d18db3257eeaf4be43b_60aac5615b8c09ff3cfc840eafbb0208a8dc4824d942df10637ed1dc43198896","50":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/bdee1144909768544fb2165d5e053e65_01eeb0b68fbe038b33bd0d952ce60590b2ff52c32da32bceee518652a89e8140","51":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/67f3816ffae3f72be42a7853607ff545_9b77f7ee9ed399fe77664a0c6cded309a14187ed325b7dace9b74f58d384fa70","52":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/4314b6591ccecaa3eb265e4e890021f5_135f42ac525c7160c6680d99d08463cca4f4f86b4a0a11252b26c57f7f6552e2","53":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/dc2498a2210f5c8dfc938909670ba68f_bb4edb324aeb76f4809d2f2ffef036815497400fd276f836d923e7e0999c3552","54":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/8ea2f8aecb65bcc3cec691be061822a6_c9e8cc4ff670def26a2014b4658f561bb39af755727ab31a04b66c703faa6bfc","55":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/cc6220508d6b50993e8cb49e6c072a3a_266d57d40828595dcf9964076955242cbc6d9cdc78bbc323ba39f0883c05fda8","56":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/6d200ee39f4096f49b523d98d8536b03_0e0d1927f658b14ff35a24c9d8fc693190c9f739a6d14b3638a69e901b1a494c","57":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/deaf0d4d4431d6bb2dcc6bda12575dc8_786be7e8e3573170e142d1c3974f18d6d69d4c4dd3ca06593467f2f53f831895","58":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/ebf339b29639355c01a7e1d0c9055ba3_0c2c6354af58c71eee179f772b8f9c9556111c042eddec488642205fce901f6a","59":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/adf758a8dc032239d05c2bf30a4a0edf_1de695275aaf84c5d9624872efacc21f2bb35d76907c032789f0a8a91007a751","60":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/fcfd73b6e3eb5a9e249b379a6f559fc7_7f12feeefb777c52da2c175bfc33dd19db40749b388af435f4a68c0f06b4f9ad","61":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/3c82d08bca770099bb1fcdbda21484ea_4b1b1a31571711440446327a37327cf86685307f7dd58ad26a5b564b384d54c9","62":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/da085ddf61fabfc523a6d5bc22ea305b_f198dc476413ae524e230ebcd428f4649509a64794bb12dfde0d8fc2d9cf8782","63":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/510c57ac818d053701321d16cfed8b3e_74210d99aa6597b227fe521b0c7e128b66510da6b2cfbd67f4d0d0f8be7a1c12","64":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/40122334960a5954255cca87d01ba5ae_1d6fa7ab07a15df79e4c61cec5a369e6e7dcc7e57ebfd52fd937630e056dbf32","65":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/281bc010da64604545531ca4074eda2e_91c47782e1e7e19e58d3d5da9e43c1c53505a145de4adcd22931721f951edced","66":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/1f0306ac15f2a11707fb6637b64ab5bc_bbf75d7a31aff638916b154d263b2fa1af9f3f53ef3124e5d470289b1b4dc5c4","67":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/99147b426f02ea63f52d7b9096bfba95_2af91854e89a8214667222ea871d98eb8c1ccaf4969ec129356be0fce2eeca51","68":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/ecebb17e5ca23da7f420fa357472bf3e_9dcc92e6966d688c956e1e6a0abf42499687f9e82b82a2499d56bb93a59b2bd8","69":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/aa968d512815321b5c74af48f3d53c3d_74f7b92a66f45f8e050a46f94cb675db7fc257acefed7ced6fe85a82caa93139","70":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/2451efa39cb6ee7576b41e14b907925a_f48ec903ab22812a385743625e972e76773bdbd3e323c73689f27eccaa9d90bc","71":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/6eca5c460748018fe91f919d35f1de02_2116d7e9c833021c7fb58237db1e8abd3e37a32f652e5449feb94cd287ca63cd","72":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/d233d65df2a27b4e6c177ab37f726c33_cea7dbcb7770a9798a49fce3a8d55689c6b79ad710e8f3aa0121bcabd9b0176b","73":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/0632159435e67bdd2a5ffd68471361f0_b7711b96d49bfe07ba4c6a9700618c69425c667999209ccbd7575925805b0b5b","74":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/1f6edebd5597bae7da63e7ad86214ccd_0bcc5ee18a9539043524fdad5d9cbdb527514143e755a1a05169e05e06c37941","75":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/31874c12d9df2dfd89cb6a446bdc4042_611644e0e6bd66f29270be999af5d4aee37a5898d93dd41c46dee111f4e63fa3","76":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/95bad31c8127deef8aef7a8c0d96285f_05b558b86db9ed61bdb134e7e32e56ddea960d18067c4d44cb7b207ceb592e5b","77":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/e1a21b6a465ba8c05aec97fa7568efb5_888ab8ab424a32a58b00808ca2f716b903993a7d076b4925c52117a2467ff04b","78":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/d8c25b3ed91a8fc91f93ac56377c9dcc_72afd96cb39f5d07ea286361edb264627d1f234e871ce48371dca57bc44c7a82","79":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/95b193e0db0f8965de5c70a5b96bb071_4b587a38a5b3b5f2eb6ad37d745531e723edc07e38eb6d4cfec3a9386f65b1e8","80":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/90b3da7e62bbd996b722975a3230f0f3_b3e89ebe3a0f9d1a6508771e1108627885b5df79377b291413a35284cc506f5e","81":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/3242156353c906577e9ea40f92139719_76cb67bcb821ef4a83b4796832b15d3ab4402627534de36c3ff592ba0e0cacb0","82":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/a4beb634fb972ef9caefecf47527e345_a18d6851882d03d4370fa12c866fcd91caa907b0cd2263a722378c399fb592b5","83":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/0447cd25e4515569c3b613bc4bd88a05_c3656ddbbf5dfc84e44c3616cfad41267c8d730e00db5918ccc77573fac07d49","84":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/1e01a4ecbeb9ca46a63b745c6a2e462d_3ebbbab14df0e2db43a2948c0298ad67ded53029efe9aba6bd40b3fd99d5aa18","85":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/559c502aea7aab4a11e121743c9d7c43_69caccfee49f747e72a4768ad4274c8b6875848e9ab7b2c8517e209d36bdfb32","86":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/b27a3afa95d849b7375a304769bd3bf3_acada7bbca2083ce55ab119e88666ca0ae10a4aac448ad5d7f45edf0077897a1","87":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/de24ae6e6b531bad57c37bffcac1954d_2c15f3da3593c9526078bb80bc7faa66ec081b1ccaea231b5c259bdb827f6fd8","88":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/7375a308c764e405f92ab9d943942949_6b7b392f5694abcfbb70daf458c22369db2f9b890583e3e2d713b046cd84ec89","89":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/a1fc8b4cb5e89f1dc3ed74ec8bafc3a5_4d0efc716f3f2cb7bda689e5daa7ba5d954ee54a8f94f7755b303043970b1d99","90":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/c4f7d2b628c661d1baad6ff1f4722da8_149e2b6f3ad488d10fce67144ccee6b66519d9d7f8482a1ff0c9ae627f1ddbca","91":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/09459647f3928e77752449f418a85c27_7a704f8cfaea62a1953dfd1e345eb6e3aee02114189f186f0181bff3a7e77fe6","92":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/655a7db862ccdfa162b6ea0dffa3ef1e_6eb133e705878e640a427b664656189f1ea9330285133e4a73a943a097606da6","93":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/434d82b430279d26bcdd9bd13ddec76f_5cbad7d7eb6740debc9e2e3c1b7197f861b705e6e74379307a5bc900d75250f5","94":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/142e64b0535a2b0c3bb5253c0d2266a9_6c7403cda6f8dc61eb9d2b32d37f608c34c641101d6a2f35c073907898a7e4ae","95":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/3f8790f1134f0514af3d2bbc05209060_6377e5dcdf0d232f1aa8139022b8c9280f8b4297f70efff3e0f7d52417c1eb23","96":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/220a705290eb7adbcdf052ddb2d11c99_06374d8546d5c745671d98686f1b4b0dd31d777b1c7bcdd0e6dfe63d0a23e719","97":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/51249bb6f506e42e17bf9241ef88b6b2_c1221205f854390df1d21aa05e5d0de264b1b953c659a10c18478cfd7f755efd","98":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/284c00b5ff1189d2bddf67df408edc4e_01c1917a244fcadf0bfd3933af21c684dd90ca274111248212025361d855ab39","99":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/37483ffe36725e05af0954a5d9a55a26_daf0a2f0e10c98c2b72be9c0da24b38322f0f956733a42565365ee615568ba07","100":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/c6b03531fed44f96acecab26828fbe37_30393b6fa3096a74bfa51cad1cb58f7660848263f01f2f7d2e12dae3a5b1c3ed","101":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/5dc9345ee6092ca006f777b42b34e853_df13ad7c61407d1a00e261fcd5fcd93c16e1a0c1be13d0903d76a21a89cd3459","102":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/1dbef9840938d5e30563c3f844b9ebac_12fe10df66a6ee48bffe72578a6f42d340ff0b4f75d4fe65f6bed2b75841e978","103":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/c3af292a916339e6c57ba0d03712a445_273c38be422269a46466d48494c513daf53b3a66440b6401c94c37f1e55070c2","104":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/b44ded0b090097528af2c4ad694c2a40_3f5ed56c662da89e1e0f3ae62a67f9e14ea2384f2985277b1cdfa6ebfe1d18c9","105":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/df8ea86906de307c52cb9cf3b2228043_312bdbd9536ec36e42d8328def8af1afcaaf3f705917a628ea4add00ba77b8b5","106":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/6846f61d6bfcf77aecd7206c6adb5be9_64e149247e52e86b671fdd2b71ac27852d54ae6eb6f4059458bdb1161f300dac","107":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/ef4a1765911453dcae8e4bdd5d3203a1_321cf3bc8710a6a19576dfe93677def4666da0b4744489c26aa44f75a753333e","108":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/dc381f9e0b6193e8be5d94595ed1c4b7_d612afde7baf43ac5daeae9e0efe42781867bc3451e3e8814253cbfc4410bb4a","109":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/9579d5dd8523c493e0590e3881e25041_106c39b7e97fdd57abb992ec7ff7c0f0b15f0f83a348e3a3698e3fcbdcdf2836","110":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/95cfda0cb7bfaac0fc789cf05c7e513e_a509049aea02886eb409c53a15e03a6cf5eb6583120267bbca75c2206027c0b1","111":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/6e05daaab9a81a2ea5348b70833bdfb6_023eb1e947686aef7764a3ce4c9683b47d2235c51a031e36b947e4398ef6906d","112":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/d29d4fcb1b25a9d424a12800869a3b65_991d563880a3345073ebb4cc3cd57778ef5cfbc3ae625cefec2ffc3b690a5aa5","113":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/983764cb5075eedbd96ec034df1374a1_a94f5a1f0c9b45b9082044ebe72774b0313a58e5a2f58d00a63827ad7d48bb62","114":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/9abafed7a919fe54046abe458a6b3140_4003c5226083b7beb7b5901c79027e3833be0aec78da9aa3fc05f0293f5bb43e","115":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/4268a231e34c78a807bd51c7d5e1064e_a9049cfd9cbbb250474c1364710dcd276e1896297b2dee37b6ffad96a882bda9","116":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/b80be54bf0fbb43ebd8a20dca4d8f6f0_544d5a34e1d959e4e7794c58503b3478de33eb4ef21e8b74839b950adda7dedd","117":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/4ce28371de65a22a241dee28128dda4d_0daec6dffe6bd726f3031d51a39728c4f88f48482ebbae6c05f758ca24dd0890","118":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/c55284b8098cbaa9a1db08cbdf46bae8_6baa7acefb038acbb2fedbfdce556766c48349c5d13374347a26bd83e2acf283","119":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/dd77cf42f690e808bb9d8131b7cec48b_0b3713716d1127b36eb335737778cca3d4b7b476a99a571a11dc118e71463d2b","120":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/c657e3f25ab9ae85a99e421231a6c6a8_06deb81cfec70dbd14da6bb6471b8ee4bcc142ee08b60714af9f91683b461e6a","121":"https:\/\/d2ojpxxtu63wzl.cloudfront.net\/static\/cd4fc426707d63e4d9b8bc9205dea3fc_cb648ffe70ec0942be80f294a1a07c5e64958570265b70cfd84da78072877fe7"}
}

});

;require.register("date_pair", function(exports, require, module) {


var DatePair = React.createClass({displayName: 'DatePair',
  componentDidMount: function() {
    $('.date').datepicker()

  },
  render: function() {
    input = {width:75, display:"inline-block",fontSize:10}
    return (
      React.createElement("div", null, 
        React.createElement("h6", {style: {fontWeight:"800"}}, "COLUMN NAME  ", 
            React.createElement("small", null, "datetime")), 
        React.createElement("p", {id: "basicExample"}, 
            React.createElement("input", {type: "text", className: "date start form-control input-sm", style: input}), 
            " ", 
            React.createElement("span", {style: {fontSize:8,fontWeight:600}}, "TO"), 
            " ", 
            React.createElement("input", {type: "text", className: "date end form-control input-sm", style: input})
        )

      )
    )
  }
})

module.exports = DatePair

});

;require.register("drop", function(exports, require, module) {
(function() {
  var Evented, MIRROR_ATTACH, addClass, allDrops, clickEvent, createContext, extend, hasClass, removeClass, sortAttach, touchDevice, _ref,
    __hasProp = {}.hasOwnProperty,
    __extends = function(child, parent) { for (var key in parent) { if (__hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    __indexOf = [].indexOf || function(item) { for (var i = 0, l = this.length; i < l; i++) { if (i in this && this[i] === item) return i; } return -1; };

  _ref = Tether.Utils, extend = _ref.extend, addClass = _ref.addClass, removeClass = _ref.removeClass, hasClass = _ref.hasClass, Evented = _ref.Evented;

  touchDevice = 'ontouchstart' in document.documentElement;

  clickEvent = touchDevice ? 'touchstart' : 'click';

  sortAttach = function(str) {
    var first, second, _ref1, _ref2;
    _ref1 = str.split(' '), first = _ref1[0], second = _ref1[1];
    if (first === 'left' || first === 'right') {
      _ref2 = [second, first], first = _ref2[0], second = _ref2[1];
    }
    return [first, second].join(' ');
  };

  MIRROR_ATTACH = {
    left: 'right',
    right: 'left',
    top: 'bottom',
    bottom: 'top',
    middle: 'middle',
    center: 'center'
  };

  allDrops = [];

  createContext = function(options) {
    var DropInstance, defaultOptions, drop;
    drop = function() {
      return (function(func, args, ctor) {
        ctor.prototype = func.prototype;
        var child = new ctor, result = func.apply(child, args);
        return Object(result) === result ? result : child;
      })(DropInstance, arguments, function(){});
    };
    extend(drop, {
      createContext: createContext,
      drops: []
    });
    defaultOptions = {
      defaults: {
        attach: 'bottom left',
        openOn: 'click',
        constrainToScrollParent: true,
        constrainToWindow: true,
        className: '',
        tetherOptions: {}
      }
    };
    extend(true, drop, defaultOptions, options);
    drop.updateBodyClasses = function() {
      var anyOpen, _drop, _i, _len;
      anyOpen = false;
      for (_i = 0, _len = allDrops.length; _i < _len; _i++) {
        _drop = allDrops[_i];
        if (!(_drop.isOpened())) {
          continue;
        }
        anyOpen = true;
        break;
      }
      if (anyOpen) {
        return addClass(document.body, 'drop-open');
      } else {
        return removeClass(document.body, 'drop-open');
      }
    };
    DropInstance = (function(_super) {
      __extends(DropInstance, _super);

      function DropInstance(options) {
        this.options = options;
        this.options = extend({}, drop.defaults, this.options);
        this.target = this.options.target;
        drop.drops.push(this);
        allDrops.push(this);
        this.setupElements();
        this.setupEvents();
        this.setupTether();
      }

      DropInstance.prototype.setupElements = function() {
        this.drop = document.createElement('div');
        addClass(this.drop, 'drop');
        if (this.options.className) {
          addClass(this.drop, this.options.className);
        }
        this.dropContent = document.createElement('div');
        addClass(this.dropContent, 'drop-content');
        if (typeof this.options.content === 'object') {
          this.dropContent.appendChild(this.options.content);
        } else {
          this.dropContent.innerHTML = this.options.content;
        }
        return this.drop.appendChild(this.dropContent);
      };

      DropInstance.prototype.setupTether = function() {
        var constraints, dropAttach;
        dropAttach = this.options.attach.split(' ');
        dropAttach[0] = MIRROR_ATTACH[dropAttach[0]];
        dropAttach = dropAttach.join(' ');
        constraints = [];
        if (this.options.constrainToScrollParent) {
          constraints.push({
            to: 'scrollParent',
            pin: 'top, bottom',
            attachment: 'together none'
          });
        }
        if (this.options.constrainToWindow !== false) {
          constraints.push({
            to: 'window',
            pin: true,
            attachment: 'together'
          });
        }
        constraints.push({
          to: 'scrollParent'
        });
        options = {
          element: this.drop,
          target: this.target,
          attachment: sortAttach(dropAttach),
          targetAttachment: sortAttach(this.options.attach),
          offset: '0 0',
          targetOffset: '0 0',
          enabled: false,
          constraints: constraints
        };
        return this.tether = new Tether(extend({}, options, this.options.tetherOptions));
      };

      DropInstance.prototype.setupEvents = function() {
        var events,
          _this = this;
        if (!this.options.openOn) {
          return;
        }
        events = this.options.openOn.split(' ');
        if (__indexOf.call(events, 'click') >= 0) {
          this.target.addEventListener(clickEvent, function() {
            return _this.toggle();
          });
          document.addEventListener(clickEvent, function(event) {
            if (!_this.isOpened()) {
              return;
            }
            if (event.target === _this.drop || _this.drop.contains(event.target)) {
              return;
            }
            if (event.target === _this.target || _this.target.contains(event.target)) {
              return;
            }
            return _this.close();
          });
        }
        if (__indexOf.call(events, 'hover') >= 0) {
          this.target.addEventListener('mouseover', function() {
            return _this.open();
          });
          return this.target.addEventListener('mouseout', function() {
            return _this.close();
          });
        }
      };

      DropInstance.prototype.isOpened = function() {
        return hasClass(this.drop, 'drop-open');
      };

      DropInstance.prototype.toggle = function() {
        if (this.isOpened()) {
          return this.close();
        } else {
          return this.open();
        }
      };

      DropInstance.prototype.open = function() {
        if (!this.drop.parentNode) {
          document.body.appendChild(this.drop);
        }
        addClass(this.target, 'drop-open');
        addClass(this.drop, 'drop-open');
        this.trigger('open');
        this.tether.enable();
        return drop.updateBodyClasses();
      };

      DropInstance.prototype.close = function() {
        removeClass(this.target, 'drop-open');
        removeClass(this.drop, 'drop-open');
        this.trigger('close');
        this.tether.disable();
        return drop.updateBodyClasses();
      };

      return DropInstance;

    })(Evented);
    return drop;
  };

  window.Drop = createContext();

  document.addEventListener('DOMContentLoaded', function() {
    return Drop.updateBodyClasses();
  });

}).call(this);

});

require.register("headhesive", function(exports, require, module) {
(function(window, document, undefined) {

    'use strict';

    //= helpers.js

    /**
     * Constructor
     */
    var Headhesive = function (elem, options) {

        // Return if feature test fails
        if (! ('querySelector' in document && 'addEventListener' in window) ) {
            return;
        }

        // Initial state
        this.visible = false;

        // Options
        this.options = {
            offset: 300,
            classes: {
                clone:    'headhesive',
                stick:   'headhesive--stick',
                unstick: 'headhesive--unstick'
            },
            throttle: 250,
            onInit: function() {},
            onStick: function() {},
            onUnstick: function() {},
            onDestroy: function() {},
        };

        // Get elem, check if string, if not assume object passed in
        this.elem = (typeof elem === 'string') ? document.querySelector(elem) : elem;

        // Merge user options with default options
        this.options = _mergeObj(this.options, options);

        // Self init
        this.init();
    };


    /**
     * Headhesive prototype methods
     */
    Headhesive.prototype = {

        constructor: Headhesive,

        /**
         * Initialise Headhesive
         */
        init: function() {

            // Clone element
            this.clonedElem = this.elem.cloneNode(true);
            this.clonedElem.className += ' ' + this.options.classes.clone;
            document.body.insertBefore(this.clonedElem, document.body.firstChild);

            // Determin offset value
            if (typeof this.options.offset === 'number') {
                this.scrollOffset = this.options.offset;

            } else if (typeof this.options.offset === 'string') {
                this.scrollOffset = _getElemY(document.querySelector(this.options.offset));

            } else {
                throw new Error('Invalid offset: ' + this.options.offset);
            }

            // Throttled scroll
            this._throttleUpdate = _throttle(this.update.bind(this), this.options.throttle);

            window.addEventListener('scroll', this._throttleUpdate, false);
            this.options.onInit.call(this);
        },

        /**
         * Clean up DOM and remove events
         */
        destroy: function() {
            document.body.removeChild(this.clonedElem);
            window.removeEventListener('scroll', this._throttleUpdate);
            this.options.onDestroy.call(this);
        },

        /**
         * Logic for sticking element
         */
        stick: function() {
            if (!this.visible) {
                this.clonedElem.className = this.clonedElem.className.replace(new RegExp('(^|\\s)*' + this.options.classes.unstick + '(\\s|$)*', 'g'), '');
                this.clonedElem.className += ' ' + this.options.classes.stick;
                this.visible = true;
                this.options.onStick.call(this);
            }
        },

        /**
         * Logic for unsticking element
         */
        unstick: function() {
            if (this.visible) {
                this.clonedElem.className = this.clonedElem.className.replace(new RegExp('(^|\\s)*' + this.options.classes.stick + '(\\s|$)*', 'g'), '');
                this.clonedElem.className += ' ' + this.options.classes.unstick;
                this.visible = false;
                this.options.onUnstick.call(this);
            }
        },

        /**
         * Update status of elem
         */
        update: function() {
            if (_getScrollY() > this.scrollOffset) {
                this.stick();
            } else {
                this.unstick();
            }
        },

    };

    window.Headhesive = Headhesive;

}(window, document));

});

require.register("initialize", function(exports, require, module) {
//var UserDatasetTable = require("table");
var routes = require('routes');



document.addEventListener('DOMContentLoaded', function() {
  console.log("lol")
  ReactRouter.run(routes, ReactRouter.HashLocation, function(Root) {
    React.render(React.createElement(Root, null), document.body);
  });
}, false);

});

require.register("instagram_row", function(exports, require, module) {
var InstagramRow = React.createClass({displayName: 'InstagramRow',
  render: function() {
    return (
      React.createElement("tr", null, 
        React.createElement("td", {style: {paddingRight:20,paddingTop:15}}, 
          React.createElement("a", {href: "#", className: "thumbnail", style: {width:50,padding:0}}, 
            React.createElement("img", {src: this.props.row.profile_pic, style: {height:50,width:50}})
          )
        ), 
          React.createElement("td", {style: {width:"25%"}}, this.props.row.description), 
          React.createElement("td", {style: {width:"25%"}}, 
            React.createElement("a", {href: this.props.row.profile_url}, 
              this.props.row.profile_url)
          ), 
          React.createElement("td", {style: {width:"25%"}}, this.props.row.subs), 
          React.createElement("td", {style: {width:"25%"}}, this.props.row.views), 
          React.createElement("td", {style: {width:"25%"}}, 
            React.createElement("a", {href: "#"}, React.createElement("i", {className: "fa fa-external-link-square"}))
          )
      )
    )
  }
})

module.exports = InstagramRow

});

;require.register("jigsaw", function(exports, require, module) {
module.exports = {
  _subindustries: function() {
    return {
      "Agriculture & Mining Other": "1019900",
      "Farming and Ranching": "1010100",
      "Fishing, Hunting and Trapping": "1010200",
      "Forestry and Logging": "1010300",
      "Mining and Quarrying": "1010500",
      "Accounting and Tax Preparation": "1020100",
      "Advertising, Marketing and PR": "1020200",
      "Business Services Other": "1029900",
      "Data and Records Management": "1020500",
      "Facilities Management and Maintenance": "1020300",
      "HR and Recruiting Services": "1020400",
      "Legal Services": "1020600",
      "Management Consulting": "1020700",
      "Payroll Services": "1021000",
      "Sales Services": "1020800",
      "Security Services": "1020900",
      "Audio, Video and Photography": "1030100",
      "Computers & Electronics Other": "1039900",
      "Computers, Parts and Repair": "1030200",
      "Consumer Electronics, Parts and Repair": "1030300",
      "IT and Network Services and Support": "1030500",
      "Instruments and Controls": "1030400",
      "Network Security Products": "1031000",
      "Networking Equipment and Systems": "1030600",
      "Office Machinery and Equipment": "1030700",
      "Peripherals Manufacturing": "1030800",
      "Semiconductor and Microchip Manufacturing": "1030900",
      "Automotive Repair & Maintenance": "1230100",
      "Consumer Services Other": "1239900",
      "Funeral Homes and Funeral Services": "1230200",
      "Laundry and Dry Cleaning": "1230300",
      "Parking Lots and Garage Management": "1230400",
      "Personal Care": "1230500",
      "Photofinishing Services": "1230600",
      "Colleges and Universities": "1050100",
      "Education Other": "1059900",
      "Elementary and Secondary Schools": "1050200",
      "Libraries, Archives and Museums": "1050300",
      "Sports, Arts and Recreation Instruction": "1050400",
      "Technical and Trade Schools": "1050500",
      "Test Preparation": "1050600",
      "Alternative Energy Sources": "1060100",
      "Energy & Utilities Other": "1069900",
      "Gas and Electric Utilities": "1060200",
      "Gasoline and Oil Refineries": "1060300",
      "Sewage Treatment Facilities": "1060400",
      "Waste Management and Recycling": "1060500",
      "Water Treatment and Utilities": "1060600",
      "Banks": "1070100",
      "Credit Cards and Related Services": "1070200",
      "Credit Unions": "1070900",
      "Financial Services Other": "1079900",
      "Insurance and Risk Management": "1070300",
      "Investment Banking and Venture Capital": "1070400",
      "Lending and Mortgage": "1070500",
      "Personal Financial Planning and Private Banking": "1070800",
      "Securities Agents and Brokers": "1070600",
      "Trust, Fiduciary, and Custody Activities": "1070700",
      "Government Other": "1099900",
      "International Bodies and Organizations": "1090100",
      "Local Government": "1090200",
      "National Government": "1090300",
      "State/Provincial Government": "1090400",
      "Biotechnology": "1100100",
      "Diagnostic Laboratories": "1100200",
      "Doctors and Health Care Practitioners": "1100300",
      "Healthcare, Pharmaceuticals, and Biotech Other": "1109900",
      "Hospitals": "1100400",
      "Medical Devices": "1101100",
      "Medical Supplies and Equipment": "1100500",
      "Outpatient Care Centers": "1100900",
      "Personal Health Care Products": "1100600",
      "Pharmaceuticals": "1100700",
      "Residential and Long-Term Care Facilities": "1100800",
      "Veterinary Clinics and Services": "1101000",
      "Aerospace and Defense": "1110100",
      "Alcoholic Beverages": "1111300",
      "Automobiles, Boats and Motor Vehicles": "1110200",
      "Chemicals and Petrochemicals": "1110300",
      "Concrete, Glass, and Building Materials": "1110800",
      "Farming and Mining Machinery and Equipment": "1111200",
      "Food & Dairy Product Manufacturing and Packaging": "1111400",
      "Furniture Manufacturing": "1110900",
      "Heavy Machinery": "1110400",
      "Manufacturing Other": "1119900",
      "Metals Manufacturing": "1111000",
      "Nonalcoholic Beverages": "1111500",
      "Paper and Paper Products": "1110500",
      "Plastics and Rubber Manufacturing": "1111100",
      "Textiles, Apparel and Accessories": "1110600",
      "Tools, Hardware and Light Machinery": "1110700",
      "Adult Entertainment": "1120100",
      "Media & Entertainment Other": "1129900",
      "Motion Picture Exhibitors": "1120600",
      "Motion Picture and Recording Producers": "1120200",
      "Newspapers, Books and Periodicals": "1120300",
      "Performing Arts": "1120400",
      "Radio and Television Broadcasting": "1120500",
      "Advocacy Organizations": "1130600",
      "Charitable Organizations and Foundations": "1130100",
      "Non-Profit Other": "1139900",
      "Professional Associations": "1130300",
      "Religious Organizations": "1130400",
      "Social and Membership Organizations": "1130200",
      "Trade Groups and Labor Unions": "1130500",
      "Other": "1249900",
      "Architecture,Engineering and Design": "1140100",
      "Construction Equipment and Supplies": "1140300",
      "Construction and Remodeling": "1140200",
      "Property Leasing and Management": "1140400",
      "Real Estate & Construction Other": "1149900",
      "Real Estate Agents and Appraisers": "1140500",
      "Real Estate Investment and Development": "1140600",
      "Automobile Dealers": "1160300",
      "Automobile Parts Stores": "1160400",
      "Beer, Wine, and Liquor Stores": "1160500",
      "Clothing and Shoes Stores": "1160600",
      "Department Stores": "1160700",
      "Florists": "1160800",
      "Furniture Stores": "1160900",
      "Gasoline Stations": "1161000",
      "Grocery and Specialty Food Stores": "1160200",
      "Hardware and Building Material Dealers": "1161100",
      "Jewelry, Luggage, and Leather Goods Stores": "1161200",
      "Office Supplies Stores": "1161300",
      "Restaurants and Bars": "1160100",
      "Retail Other": "1169900",
      "Sporting Goods, Hobby, Book, and Music Stores": "1161400",
      "Data Analytics, Management and Storage": "1180100",
      "E-commerce and Internet Businesses": "1180200",
      "Games and Gaming": "1180300",
      "Software": "1180400",
      "Software & Internet Other": "1189900",
      "Cable Television Providers": "1190500",
      "Telecommunications Equipment and Accessories": "1190100",
      "Telecommunications Other": "1199900",
      "Telephone Service Providers and Carriers": "1190200",
      "Video and Teleconferencing": "1190300",
      "Wireless and Mobile": "1190400",
      "Air Couriers and Cargo Services": "1200100",
      "Airport, Harbor and Terminal Operations": "1200200",
      "Freight Hauling (Rail and Truck)": "1200300",
      "Marine and Inland Shipping": "1200400",
      "Moving Companies and Services": "1200500",
      "Postal, Express Delivery, and Couriers": "1200600",
      "Transportation & Storage Other": "1209900",
      "Warehousing and Storage": "1200700",
      "Amusement Parks and Attractions": "1210900",
      "Cruise Ship Operations": "1210100",
      "Gambling and Gaming Industries": "1211000",
      "Hotels, Motels and Lodging": "1210200",
      "Participatory Sports and Recreation": "1211100",
      "Passenger Airlines": "1210300",
      "Rental Cars": "1210400",
      "Resorts and Casinos": "1210500",
      "Spectator Sports and Teams": "1211200",
      "Taxi and Limousine Services": "1210600",
      "Trains, Buses and Transit Systems": "1210700",
      "Travel Agents & Services": "1210800",
      "Travel, Recreation, and Leisure Other": "1219900",
      "Apparel Wholesalers": "1220100",
      "Automobile Parts Wholesalers": "1220200",
      "Beer, Wine, and Liquor Wholesalers": "1220300",
      "Chemicals and Plastics Wholesalers": "1220400",
      "Grocery and Food Wholesalers": "1220500",
      "Lumber and Construction Materials Wholesalers": "1220600",
      "Metal & Mineral Wholesalers": "1220700",
      "Office Equipment and Supplies Wholesalers": "1220800",
      "Petroleum Products Wholesalers": "1220900",
      "Wholesale & Distribution Other": "1229900",
      "Agriculture & Mining Other": "1019900",
      "Farming and Ranching": "1010100",
      "Fishing, Hunting and Trapping": "1010200",
      "Forestry and Logging": "1010300",
      "Mining and Quarrying": "1010500",
      "Accounting and Tax Preparation": "1020100",
      "Advertising, Marketing and PR": "1020200",
      "Business Services Other": "1029900",
      "Data and Records Management": "1020500",
      "Facilities Management and Maintenance": "1020300",
      "HR and Recruiting Services": "1020400",
      "Legal Services": "1020600",
      "Management Consulting": "1020700",
      "Payroll Services": "1021000",
      "Sales Services": "1020800",
      "Security Services": "1020900",
      "Audio, Video and Photography": "1030100",
      "Computers & Electronics Other": "1039900",
      "Computers, Parts and Repair": "1030200",
      "Consumer Electronics, Parts and Repair": "1030300",
      "IT and Network Services and Support": "1030500",
      "Instruments and Controls": "1030400",
      "Network Security Products": "1031000",
      "Networking Equipment and Systems": "1030600",
      "Office Machinery and Equipment": "1030700",
      "Peripherals Manufacturing": "1030800",
      "Semiconductor and Microchip Manufacturing": "1030900",
      "Automotive Repair & Maintenance": "1230100",
      "Consumer Services Other": "1239900",
      "Funeral Homes and Funeral Services": "1230200",
      "Laundry and Dry Cleaning": "1230300",
      "Parking Lots and Garage Management": "1230400",
      "Personal Care": "1230500",
      "Photofinishing Services": "1230600",
      "Colleges and Universities": "1050100",
      "Education Other": "1059900",
      "Elementary and Secondary Schools": "1050200",
      "Libraries, Archives and Museums": "1050300",
      "Sports, Arts and Recreation Instruction": "1050400",
      "Technical and Trade Schools": "1050500",
      "Test Preparation": "1050600",
      "Alternative Energy Sources": "1060100",
      "Energy & Utilities Other": "1069900",
      "Gas and Electric Utilities": "1060200",
      "Gasoline and Oil Refineries": "1060300",
      "Sewage Treatment Facilities": "1060400",
      "Waste Management and Recycling": "1060500",
      "Water Treatment and Utilities": "1060600",
      "Banks": "1070100",
      "Credit Cards and Related Services": "1070200",
      "Credit Unions": "1070900",
      "Financial Services Other": "1079900",
      "Insurance and Risk Management": "1070300",
      "Investment Banking and Venture Capital": "1070400",
      "Lending and Mortgage": "1070500",
      "Personal Financial Planning and Private Banking": "1070800",
      "Securities Agents and Brokers": "1070600",
      "Trust, Fiduciary, and Custody Activities": "1070700",
      "Government Other": "1099900",
      "International Bodies and Organizations": "1090100",
      "Local Government": "1090200",
      "National Government": "1090300",
      "State/Provincial Government": "1090400",
      "Biotechnology": "1100100",
      "Diagnostic Laboratories": "1100200",
      "Doctors and Health Care Practitioners": "1100300",
      "Healthcare, Pharmaceuticals, and Biotech Other": "1109900",
      "Hospitals": "1100400",
      "Medical Devices": "1101100",
      "Medical Supplies and Equipment": "1100500",
      "Outpatient Care Centers": "1100900",
      "Personal Health Care Products": "1100600",
      "Pharmaceuticals": "1100700",
      "Residential and Long-Term Care Facilities": "1100800",
      "Veterinary Clinics and Services": "1101000",
      "Aerospace and Defense": "1110100",
      "Alcoholic Beverages": "1111300",
      "Automobiles, Boats and Motor Vehicles": "1110200",
      "Chemicals and Petrochemicals": "1110300",
      "Concrete, Glass, and Building Materials": "1110800",
      "Farming and Mining Machinery and Equipment": "1111200",
      "Food & Dairy Product Manufacturing and Packaging": "1111400",
      "Furniture Manufacturing": "1110900",
      "Heavy Machinery": "1110400",
      "Manufacturing Other": "1119900",
      "Metals Manufacturing": "1111000",
      "Nonalcoholic Beverages": "1111500",
      "Paper and Paper Products": "1110500",
      "Plastics and Rubber Manufacturing": "1111100",
      "Textiles, Apparel and Accessories": "1110600",
      "Tools, Hardware and Light Machinery": "1110700",
      "Adult Entertainment": "1120100",
      "Media & Entertainment Other": "1129900",
      "Motion Picture Exhibitors": "1120600",
      "Motion Picture and Recording Producers": "1120200",
      "Newspapers, Books and Periodicals": "1120300",
      "Performing Arts": "1120400",
      "Radio and Television Broadcasting": "1120500",
      "Advocacy Organizations": "1130600",
      "Charitable Organizations and Foundations": "1130100",
      "Non-Profit Other": "1139900",
      "Professional Associations": "1130300",
      "Religious Organizations": "1130400",
      "Social and Membership Organizations": "1130200",
      "Trade Groups and Labor Unions": "1130500",
      "Other": "1249900",
      "Architecture,Engineering and Design": "1140100",
      "Construction Equipment and Supplies": "1140300",
      "Construction and Remodeling": "1140200",
      "Property Leasing and Management": "1140400",
      "Real Estate & Construction Other": "1149900",
      "Real Estate Agents and Appraisers": "1140500",
      "Real Estate Investment and Development": "1140600",
      "Automobile Dealers": "1160300",
      "Automobile Parts Stores": "1160400",
      "Beer, Wine, and Liquor Stores": "1160500",
      "Clothing and Shoes Stores": "1160600",
      "Department Stores": "1160700",
      "Florists": "1160800",
      "Furniture Stores": "1160900",
      "Gasoline Stations": "1161000",
      "Grocery and Specialty Food Stores": "1160200",
      "Hardware and Building Material Dealers": "1161100",
      "Jewelry, Luggage, and Leather Goods Stores": "1161200",
      "Office Supplies Stores": "1161300",
      "Restaurants and Bars": "1160100",
      "Retail Other": "1169900",
      "Sporting Goods, Hobby, Book, and Music Stores": "1161400",
      "Data Analytics, Management and Storage": "1180100",
      "E-commerce and Internet Businesses": "1180200",
      "Games and Gaming": "1180300",
      "Software": "1180400",
      "Software & Internet Other": "1189900",
      "Cable Television Providers": "1190500",
      "Telecommunications Equipment and Accessories": "1190100",
      "Telecommunications Other": "1199900",
      "Telephone Service Providers and Carriers": "1190200",
      "Video and Teleconferencing": "1190300",
      "Wireless and Mobile": "1190400",
      "Air Couriers and Cargo Services": "1200100",
      "Airport, Harbor and Terminal Operations": "1200200",
      "Freight Hauling (Rail and Truck)": "1200300",
      "Marine and Inland Shipping": "1200400",
      "Moving Companies and Services": "1200500",
      "Postal, Express Delivery, and Couriers": "1200600",
      "Transportation & Storage Other": "1209900",
      "Warehousing and Storage": "1200700",
      "Amusement Parks and Attractions": "1210900",
      "Cruise Ship Operations": "1210100",
      "Gambling and Gaming Industries": "1211000",
      "Hotels, Motels and Lodging": "1210200",
      "Participatory Sports and Recreation": "1211100",
      "Passenger Airlines": "1210300",
      "Rental Cars": "1210400",
      "Resorts and Casinos": "1210500",
      "Spectator Sports and Teams": "1211200",
      "Taxi and Limousine Services": "1210600",
      "Trains, Buses and Transit Systems": "1210700",
      "Travel Agents & Services": "1210800",
      "Travel, Recreation, and Leisure Other": "1219900",
      "Apparel Wholesalers": "1220100",
      "Automobile Parts Wholesalers": "1220200",
      "Beer, Wine, and Liquor Wholesalers": "1220300",
      "Chemicals and Plastics Wholesalers": "1220400",
      "Grocery and Food Wholesalers": "1220500",
      "Lumber and Construction Materials Wholesalers": "1220600",
      "Metal & Mineral Wholesalers": "1220700",
      "Office Equipment and Supplies Wholesalers": "1220800",
      "Petroleum Products Wholesalers": "1220900",
      "Wholesale & Distribution Other": "1229900",
    }
  },

  _industries: function() { 
     return {"All Industries": "*{#ALL#}*",
      "Agriculture & Mining": "1010000",
      "Business Services": "1020000",
      "Computers & Electronics": "1030000",
      "Consumer Services": "1230000",
      "Education": "1050000",
      "Energy & Utilities": "1060000",
      "Financial Services": "1070000",
      "Government": "1090000",
      "Healthcare, Pharmaceuticals, & Biotech": "1100000",
      "Manufacturing": "1110000",
      "Media & Entertainment": "1120000",
      "Non-Profit": "1130000",
      "Other": "1240000",
      "Real Estate & Construction": "1140000",
      "Retail": "1160000",
      "Software & Internet": "1180000",
      "Telecommunications": "1190000",
      "Transportation & Storage": "1200000",
      "Travel, Recreation, and Leisure": "1210000",
      "Wholesale & Distribution": "1220000",
    }
  },

  _states: function() {
    return { "Alabama": "9002",
"Alaska": "9001",
"American Samoa": "9101",
"Arizona": "9004",
"Arkansas": "9003",
"California": "9005",
"Colorado": "9006",
"Connecticut": "9007",
"Delaware": "9009",
"District of Columbia": "9008",
"Federated States of Micronesia": "9102",
"Florida": "9010",
"Georgia": "9011",
"Guam": "9103",
"Hawaii": "9012",
"Idaho": "9014",
"Illinois": "9015",
"Indiana": "9016",
"Iowa": "9013",
"Kansas": "9017",
"Kentucky": "9018",
"Louisiana": "9019",
"Maine": "9022",
"Marshall Islands": "9104",
"Maryland": "9021",
"Massachusetts": "9020",
"Michigan": "9023",
"Minnesota": "9024",
"Mississippi": "9026",
"Missouri": "9025",
"Montana": "9027",
"Nebraska": "9030",
"Nevada": "9034",
"New Hampshire": "9031",
"New Jersey": "9032",
"New Mexico": "9033",
"New York": "9035",
"North Carolina": "9028",
"North Dakota": "9029",
"Northern Mariana Islands": "9105",
"Ohio": "9036",
"Oklahoma": "9037",
"Oregon": "9038",
"Palau": "9107",
"Pennsylvania": "9039",
"Puerto Rico": "9106",
"Rhode Island": "9040",
"South Carolina": "9041",
"South Dakota": "9042",
"Tennessee": "9043",
"Texas": "9044",
"Utah": "9045",
"Vermont": "9047",
"Virgin Islands": "9108",
"Virginia": "9046",
"Washington": "9048",
"West Virginia": "9050",
"Wisconsin": "9049",
"Wyoming": "9051",
"Australian Capital Territory": "1001",
"New South Wales": "1002",
"Northern Territory": "1003",
"Queensland": "1004",
"South Australia": "1005",
"Tasmania": "1006",
"Victoria": "1007",
"Western Australia": "1008",
"Acre": "9028001",
"Alagoas": "9028002",
"Amapá": "9028003",
"Amazonas": "9028004",
"Bahia": "9028005",
"Ceará": "9028006",
"Distrito Federal": "9028007",
"Espírito Santo": "9028008",
"Goiás": "9028009",
"Maranhão": "9028010",
"Mato Grosso": "9028011",
"Mato Grosso do Sul": "9028012",
"Minas Gerais": "9028013",
"Paraná": "9028016",
"Paraíba": "9028015",
"Pará": "9028014",
"Pernambuco": "9028017",
"Piauí": "9028018",
"Rio Grande do Norte": "9028020",
"Rio Grande do Sul": "9028021",
"Rio de Janeiro": "9028019",
"Rondônia": "9028022",
"Roraima": "9028023",
"Santa Catarina": "9028024",
"Sergipe": "9028026",
"São Paulo": "9028025",
"Tocantins": "9028027",
"Alberta": "2001",
"British Columbia": "2002",
"Manitoba": "2003",
"New Brunswick": "2004",
"Newfoundland and Labrador": "2005",
"Northwest Territories": "2007",
"Nova Scotia": "2006",
"Nunavut": "2008",
"Ontario": "2009",
"Prince Edward Island": "2010",
"Quebec": "2011",
"Saskatchewan": "2012",
"Yukon": "2013",
"Andaman and Nicobar Islands": "3002",
"Andhra Pradesh": "3003",
"Arunachal Pradesh": "3004",
"Assam": "3005",
"Bihar": "3006",
"Chandigarh": "3007",
"Chhattisgarh": "3008",
"Dadra and Nagar Haveli": "3009",
"Daman and Diu": "3010",
"Delhi": "3011",
"Goa": "3012",
"Gujarat": "3013",
"Haryana": "3014",
"Himachal Pradesh": "3015",
"Jammu and Kashmir": "3016",
"Jharkhand": "3017",
"Karnataka": "3018",
"Kerala": "3019",
"Lakshadweep": "3020",
"Madhya Pradesh": "3021",
"Maharashtra": "3022",
"Manipur": "3023",
"Meghalaya": "3024",
"Mizoram": "3025",
"Nagaland": "3026",
"Orissa": "3027",
"Puducherry": "3028",
"Punjab": "3029",
"Rajasthan": "3030",
"Sikkim": "3031",
"Tamil Nadu": "3032",
"Tripura": "3033",
"Uttar Pradesh": "3035",
"Uttarakhand": "3034",
"West Bengal": "3036",
"Carlow": "4001",
"Cavan": "4002",
"Clare": "4003",
"Cork": "4004",
"Donegal": "4005",
"Dublin": "4006",
"Galway": "4007",
"Kerry": "4008",
"Kildare": "4009",
"Kilkenny": "4010",
"Laois": "4011",
"Leitrim": "4012",
"Limerick": "4013",
"Longford": "4014",
"Louth": "4015",
"Mayo": "4016",
"Meath": "4017",
"Monaghan": "4018",
"Offaly": "4019",
"Roscommon": "4020",
"Sligo": "4021",
"Tipperary": "4022",
"Waterford": "4023",
"Westmeath": "4024",
"Wexford": "4025",
"Wicklow": "4026",
"Alabama": "9002",
"Alaska": "9001",
"American Samoa": "9101",
"Arizona": "9004",
"Arkansas": "9003",
"California": "9005",
"Colorado": "9006",
"Connecticut": "9007",
"Delaware": "9009",
"District of Columbia": "9008",
"Federated States of Micronesia": "9102",
"Florida": "9010",
"Georgia": "9011",
"Guam": "9103",
"Hawaii": "9012",
"Idaho": "9014",
"Illinois": "9015",
"Indiana": "9016",
"Iowa": "9013",
"Kansas": "9017",
"Kentucky": "9018",
"Louisiana": "9019",
"Maine": "9022",
"Marshall Islands": "9104",
"Maryland": "9021",
"Massachusetts": "9020",
"Michigan": "9023",
"Minnesota": "9024",
"Mississippi": "9026",
"Missouri": "9025",
"Montana": "9027",
"Nebraska": "9030",
"Nevada": "9034",
"New Hampshire": "9031",
"New Jersey": "9032",
"New Mexico": "9033",
"New York": "9035",
"North Carolina": "9028",
"North Dakota": "9029",
"Northern Mariana Islands": "9105",
"Ohio": "9036",
"Oklahoma": "9037",
"Oregon": "9038",
"Palau": "9107",
"Pennsylvania": "9039",
"Puerto Rico": "9106",
"Rhode Island": "9040",
"South Carolina": "9041",
"South Dakota": "9042",
"Tennessee": "9043",
"Texas": "9044",
"Utah": "9045",
"Vermont": "9047",
"Virgin Islands": "9108",
"Virginia": "9046",
"Washington": "9048",
"West Virginia": "9050",
"Wisconsin": "9049",
"Wyoming": "9051",
"Australian Capital Territory": "1001",
"New South Wales": "1002",
"Northern Territory": "1003",
"Queensland": "1004",
"South Australia": "1005",
"Tasmania": "1006",
"Victoria": "1007",
"Western Australia": "1008",
"Acre": "9028001",
"Alagoas": "9028002",
"Amapá": "9028003",
"Amazonas": "9028004",
"Bahia": "9028005",
"Ceará": "9028006",
"Distrito Federal": "9028007",
"Espírito Santo": "9028008",
"Goiás": "9028009",
"Maranhão": "9028010",
"Mato Grosso": "9028011",
"Mato Grosso do Sul": "9028012",
"Minas Gerais": "9028013",
"Paraná": "9028016",
"Paraíba": "9028015",
"Pará": "9028014",
"Pernambuco": "9028017",
"Piauí": "9028018",
"Rio Grande do Norte": "9028020",
"Rio Grande do Sul": "9028021",
"Rio de Janeiro": "9028019",
"Rondônia": "9028022",
"Roraima": "9028023",
"Santa Catarina": "9028024",
"Sergipe": "9028026",
"São Paulo": "9028025",
"Tocantins": "9028027",
"Alberta": "2001",
"British Columbia": "2002",
"Manitoba": "2003",
"New Brunswick": "2004",
"Newfoundland and Labrador": "2005",
"Northwest Territories": "2007",
"Nova Scotia": "2006",
"Nunavut": "2008",
"Ontario": "2009",
"Prince Edward Island": "2010",
"Quebec": "2011",
"Saskatchewan": "2012",
"Yukon": "2013",
"Andaman and Nicobar Islands": "3002",
"Andhra Pradesh": "3003",
"Arunachal Pradesh": "3004",
"Assam": "3005",
"Bihar": "3006",
"Chandigarh": "3007",
"Chhattisgarh": "3008",
"Dadra and Nagar Haveli": "3009",
"Daman and Diu": "3010",
"Delhi": "3011",
"Goa": "3012",
"Gujarat": "3013",
"Haryana": "3014",
"Himachal Pradesh": "3015",
"Jammu and Kashmir": "3016",
"Jharkhand": "3017",
"Karnataka": "3018",
"Kerala": "3019",
"Lakshadweep": "3020",
"Madhya Pradesh": "3021",
"Maharashtra": "3022",
"Manipur": "3023",
"Meghalaya": "3024",
"Mizoram": "3025",
"Nagaland": "3026",
"Orissa": "3027",
"Puducherry": "3028",
"Punjab": "3029",
"Rajasthan": "3030",
"Sikkim": "3031",
"Tamil Nadu": "3032",
"Tripura": "3033",
"Uttar Pradesh": "3035",
"Uttarakhand": "3034",
"West Bengal": "3036",
"Carlow": "4001",
"Cavan": "4002",
"Clare": "4003",
"Cork": "4004",
"Donegal": "4005",
"Dublin": "4006",
"Galway": "4007",
"Kerry": "4008",
"Kildare": "4009",
"Kilkenny": "4010",
"Laois": "4011",
"Leitrim": "4012",
"Limerick": "4013",
"Longford": "4014",
"Louth": "4015",
"Mayo": "4016",
"Meath": "4017",
"Monaghan": "4018",
"Offaly": "4019",
"Roscommon": "4020",
"Sligo": "4021",
"Tipperary": "4022",
"Waterford": "4023",
"Westmeath": "4024",
"Wexford": "4025",
"Wicklow": "4026",
}
},


  _countries: function() {
    return {
      "All Locations": "*{#ALL#}*",
      "United States": "9000",
      "Australia": "1000",
      "Brazil": "9028",
      "Canada": "2000",
      "India": "3000",
      "Ireland": "4000",
      "New Zealand": "5000",
      "Singapore": "6000",
      "South Africa": "7000",
      "United Kingdom": "8000",
      "All Locations": "*{#ALL#}*",
      "United States": "9000",
      "Australia": "1000",
      "Brazil": "9028",
      "Canada": "2000",
      "India": "3000",
      "Ireland": "4000",
      "New Zealand": "5000",
      "Singapore": "6000",
      "South Africa": "7000",
      "United Kingdom": "8000",
      }
  },

  _metro_regions: function() {
      return { "All Locations": "*{#ALL#}*",
        "Atlanta": "101",
        "Baltimore/Washington": "102",
        "Boston": "103",
        "Chicago": "104",
        "Cleveland": "130",
        "Dallas": "105",
        "Denver": "106",
        "Detroit": "107",
        "Houston": "131",
        "Los Angeles": "108",
        "Miami": "109",
        "Minneapolis/St. Paul": "110",
        "New York": "111",
        "Philadelphia": "112",
        "Phoenix": "113",
        "Portland": "114",
        "Saint Louis": "132",
        "Salt Lake City": "115",
        "San Diego": "116",
        "San Francisco": "117",
        "Seattle": "118",
        "Calgary": "201",
        "Edmonton": "202",
        "Montreal": "203",
        "Ottawa": "204",
        "Quebec": "205",
        "Toronto": "206",
        "Vancouver": "207",
        "Victoria": "208",
        "Winnipeg": "209",
        "All Locations": "*{#ALL#}*",
        "Atlanta": "101",
        "Baltimore/Washington": "102",
        "Boston": "103",
        "Chicago": "104",
        "Cleveland": "130",
        "Dallas": "105",
        "Denver": "106",
        "Detroit": "107",
        "Houston": "131",
        "Los Angeles": "108",
        "Miami": "109",
        "Minneapolis/St. Paul": "110",
        "New York": "111",
        "Philadelphia": "112",
        "Phoenix": "113",
        "Portland": "114",
        "Saint Louis": "132",
        "Salt Lake City": "115",
        "San Diego": "116",
        "San Francisco": "117",
        "Seattle": "118",
        "Calgary": "201",
        "Edmonton": "202",
        "Montreal": "203",
        "Ottawa": "204",
        "Quebec": "205",
        "Toronto": "206",
        "Vancouver": "207",
        "Victoria": "208",
        "Winnipeg": "209",
      }
  },
  _senority_level: function() {
      return {
         "All Levels": "*{#ALL#}*",
         "C-Level": "10",
         "VP-Level": "20",
         "Director-Level": "30",
         "Manager-Level": "40",
         "Staff": "50",
        }
  },

  _number_of_employees: function() {
      return {
         "All Employee Sizes": "*{#ALL#}*",
          "0 - 25": "10",
          "25 - 100": "20",
          "100 - 250": "30",
          "250 - 1000": "40",
          "1K - 10K": "50",
          "10K - 50K": "60",
          "50K - 100K": "70",
          "> 100K": "80",
      }
  },

  _annual_revenue: function() {
       return {
        "All Revenue Levels": "*{#ALL#}*",
        "$0 - 1M": "10",
        "$1 - 10M": "20",
        "$10 - 50M": "30",
        "$50 - 100M": "40",
        "$100 - 250M": "50",
        "$250 - 500M": "60",
        "$500M - 1B": "70",
        "> $1B": "80",
      }
  },

  _department: function() {
     return {
      "All Departments": "*{#ALL#}*",
      "Sales": "10",
      "Marketing": "20",
      "Finance & Administration": "30",
      "Human Resources": "40",
      "Support": "50",
      "Engineering & Research": "60",
      "Operations": "70",
      "IT & IS": "80",
      "Other": "500",
    }
  }
}

});

;require.register("jquery.dropdown", function(exports, require, module) {
/*
 * jQuery dropdown: A simple dropdown plugin
 *
 * Copyright A Beautiful Site, LLC. (http://www.abeautifulsite.net/)
 *
 * Licensed under the MIT license: http://opensource.org/licenses/MIT
 *
*/
if (jQuery) (function ($) {

    $.extend($.fn, {
        dropdown: function (method, data) {

            switch (method) {
                case 'show':
                    show(null, $(this));
                    return $(this);
                case 'hide':
                    hide();
                    return $(this);
                case 'attach':
                    return $(this).attr('data-dropdown', data);
                case 'detach':
                    hide();
                    return $(this).removeAttr('data-dropdown');
                case 'disable':
                    return $(this).addClass('dropdown-disabled');
                case 'enable':
                    hide();
                    return $(this).removeClass('dropdown-disabled');
            }

        }
    });

    function show(event, object) {

        var trigger = event ? $(this) : object,
			dropdown = $(trigger.attr('data-dropdown')),
			isOpen = trigger.hasClass('dropdown-open');

        // In some cases we don't want to show it
        if (event) {
            if ($(event.target).hasClass('dropdown-ignore')) return;

            event.preventDefault();
            event.stopPropagation();
        } else {
            if (trigger !== object.target && $(object.target).hasClass('dropdown-ignore')) return;
        }
        hide();

        if (isOpen || trigger.hasClass('dropdown-disabled')) return;

        // Show it
        trigger.addClass('dropdown-open');
        dropdown
			.data('dropdown-trigger', trigger)
			.show();

        // Position it
        position();

        // Trigger the show callback
        dropdown
			.trigger('show', {
				dropdown: dropdown,
				trigger: trigger
			});

    }

    function hide(event) {

        // In some cases we don't hide them
        var targetGroup = event ? $(event.target).parents().addBack() : null;

        // Are we clicking anywhere in a dropdown?
        if (targetGroup && targetGroup.is('.dropdown')) {
            // Is it a dropdown menu?
            if (targetGroup.is('.dropdown-menu')) {
                // Did we click on an option? If so close it.
                if (!targetGroup.is('A')) return;
            } else {
                // Nope, it's a panel. Leave it open.
                return;
            }
        }

        // Hide any dropdown that may be showing
        $(document).find('.dropdown:visible').each(function () {
            var dropdown = $(this);
            dropdown
				.hide()
				.removeData('dropdown-trigger')
				.trigger('hide', { dropdown: dropdown });
        });

        // Remove all dropdown-open classes
        $(document).find('.dropdown-open').removeClass('dropdown-open');

    }

    function position() {

        var dropdown = $('.dropdown:visible').eq(0),
			trigger = dropdown.data('dropdown-trigger'),
			hOffset = trigger ? parseInt(trigger.attr('data-horizontal-offset') || 0, 10) : null,
			vOffset = trigger ? parseInt(trigger.attr('data-vertical-offset') || 0, 10) : null;

        if (dropdown.length === 0 || !trigger) return;

        // Position the dropdown relative-to-parent...
        if (dropdown.hasClass('dropdown-relative')) {
            dropdown.css({
                left: dropdown.hasClass('dropdown-anchor-right') ?
					trigger.position().left - (dropdown.outerWidth(true) - trigger.outerWidth(true)) - parseInt(trigger.css('margin-right'), 10) + hOffset :
					trigger.position().left + parseInt(trigger.css('margin-left'), 10) + hOffset,
                top: trigger.position().top + trigger.outerHeight(true) - parseInt(trigger.css('margin-top'), 10) + vOffset
            });
        } else {
            // ...or relative to document
            dropdown.css({
                left: dropdown.hasClass('dropdown-anchor-right') ?
					trigger.offset().left - (dropdown.outerWidth() - trigger.outerWidth()) + hOffset : trigger.offset().left + hOffset,
                top: trigger.offset().top + trigger.outerHeight() + vOffset
            });
        }
    }

    $(document).on('click.dropdown', '[data-dropdown]', show);
    $(document).on('click.dropdown', hide);
    $(window).on('resize', position);

})(jQuery);
});

require.register("landing_brand", function(exports, require, module) {
var LandingPage = React.createClass({displayName: 'LandingPage',
  home: function() {
    location.href="/#landing"
  },

  signUp: function() {
    data = {}
    $.ajax({
      url:location.origin+ "/signup",
      data: {},
      dataType:"json",
      success: function(res) {
        console.log(res)
        location.currentUser(res.token)
      },
      error: function(err) {
        console.log(err)
      }
    })
  },

  componentDidMount: function() {
    $('.form-control').floatlabel({
      labelClass:"floatingLabel",
      labelEndTop :"5px"
    });
  },

  render: function() {
    return (
      React.createElement("div", {style: {height:"100%",color:"white",fontFamily:"proxima-nova",overflow:"hidden"}}, 
        React.createElement("div", {className: "bg-gradient", style: {height:"100%",position:"relative",zIndex:20}}, 
          React.createElement("video", {src: "images/D18_9_310_preview.mp4", style: {position:"absolute",width:"100%",top:0,left:0,zIndex:1,opacity:0.1}, 
                loop: true, autoPlay: true}), 
        React.createElement("div", {className: "container", style: {position:"relative",zIndex:30,paddingTop:50}}, 

        React.createElement("h4", {style: {fontWeight:800,fontSize:22,cursor:"pointer"}, 
          onClick: this.home}, 
          React.createElement("img", {src: "images/infiq_white.png", style: {float:"left",height:25,marginRight:0}}), " " + ' ' +
          "InfluencerIQ"), 

        React.createElement("span", {style: {float:"right",marginTop:-32,marginRight:200}}, 
        React.createElement("a", {href: "#pricing", className: "", style: {marginTop:-32,marginRight:30,fontWeight:600,fontSize:12,color:"#fff"}}, "CREATORS"), 
        React.createElement("a", {href: "#pricing", className: "", style: {marginTop:-32,marginRight:30,fontWeight:600,fontSize:12,color:"#fff"}}, "BRANDS"), 
        React.createElement("a", {href: "#pricing", className: "", style: {marginTop:-32,marginRight:30,fontWeight:600,fontSize:12,color:"#fff"}}, "ABOUT US"), 
        React.createElement("a", {href: "#pricing", className: "", style: {marginTop:-32,marginRight:30,fontWeight:600,fontSize:12,color:"#fff"}}, "PRICING")
        ), 

        React.createElement("a", {href: "#login", className: "btn btn-primary", style: {float:"right",marginTop:-40}}, "LOG IN"), 
        React.createElement("div", {className: "row", style: {marginTop:40}}, 
        React.createElement("div", {className: "col-md-6"}, 
          React.createElement("h1", null, 
            React.createElement("span", null, "Launch an elite marketing campaign in minutes. "), " ", React.createElement("br", null), 
            React.createElement("br", null), 
            React.createElement("span", null, "Leverage social media influencers in your city and around the world")
          ), 
          React.createElement("hr", null), 
          React.createElement("br", null), 
          React.createElement("h2", {style: {marginTop:20,fontWeight:100}}, 
            "InfluencerIQ connects you with the top social media influencers and content creators from our vetted talent pool.",  
            React.createElement("br", null), 
            React.createElement("br", null), 
              React.createElement("span", {style: {fontStyle:"italic"}}, 
            "Get a guaranteed price quote in minutes."
              ), 
            React.createElement("span", {style: {fontStyle:"italic",display:"none"}}, 
              React.createElement("span", null, "BRAND BOOKINGS, &"), " ", React.createElement("br", null), 
              React.createElement("span", null, "PRODUCT PLACEMENTS")
          )), 
          React.createElement("span", {style: {display:"none"}}, 
            React.createElement("input", {type: "text", className: "form-control input-lg", style: {marginTop:30,width:300,borderRadius:2,fontSize:16}, placeholder: "EMAIL"}), 
            React.createElement("input", {type: "text", className: "form-control input-lg", style: {marginTop:10,width:300,borderRadius:2,fontSize:16}, placeholder: "PASSWORD", type: "password"}), 
            React.createElement("input", {type: "text", className: "form-control input-lg", style: {marginTop:10,width:300,borderRadius:2,fontSize:16}, placeholder: "CONFIRM PASSWORD", type: "password"}), 
            React.createElement("a", {className: "btn btn-lg btn-success", style: {marginTop:10,width:150,fontSize:16}}, "SIGN UP")
          )
        ), 

        React.createElement("div", {className: "col-md-6", style: {textAlign:"center"}}, 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("img", {src: "images/signaliq.png", style: {display:"none",height:450,float:"left",marginLeft:100,marginTop:20}}), 
          React.createElement("a", {href: "javascript:", className: "big-btn btn-lg btn btn-primary"}, "GET STARTED NOW  ", React.createElement("i", {className: "fa fa-arrow-right", style: {float:"right"}})), 
          React.createElement("br", null), 
          React.createElement("br", null)
        )
        )
      )
      )
      )
    )
  }
})


module.exports = LandingPage

});

;require.register("landing_creator", function(exports, require, module) {
var LandingPage = React.createClass({displayName: 'LandingPage',
  home: function() {
    location.href="/#landing"
  },

  signUp: function() {
    data = {}
    $.ajax({
      url:location.origin+ "/signup",
      data: {},
      dataType:"json",
      success: function(res) {
        console.log(res)
        location.currentUser(res.token)
      },
      error: function(err) {
        console.log(err)
      }
    })
  },

  componentDidMount: function() {
    $('.form-control').floatlabel({
      labelClass:"floatingLabel",
      labelEndTop :"5px"
    });
  },

  render: function() {
    return (
      React.createElement("div", {style: {height:"100%",color:"white",fontFamily:"proxima-nova",overflow:"hidden"}}, 
        React.createElement("div", {className: "bg-gradient", style: {height:"100%",position:"relative",zIndex:20}}, 
          React.createElement("video", {src: "images/D18_9_310_preview.mp4", style: {position:"absolute",width:"100%",top:0,left:0,zIndex:1,opacity:0.1}, 
                loop: true, autoPlay: true}), 
        React.createElement("div", {className: "container", style: {position:"relative",zIndex:30,paddingTop:50}}, 

        React.createElement("h4", {style: {fontWeight:800,fontSize:22,cursor:"pointer"}, 
          onClick: this.home}, 
          React.createElement("img", {src: "images/infiq_white.png", style: {float:"left",height:25,marginRight:0}}), " " + ' ' +
          "InfluencerIQ"), 

        React.createElement("span", {style: {float:"right",marginTop:-32,marginRight:200}}, 
        React.createElement("a", {href: "#pricing", className: "", style: {marginTop:-32,marginRight:30,fontWeight:600,fontSize:12,color:"#fff"}}, "CREATORS"), 
        React.createElement("a", {href: "#pricing", className: "", style: {marginTop:-32,marginRight:30,fontWeight:600,fontSize:12,color:"#fff"}}, "BRANDS"), 
        React.createElement("a", {href: "#pricing", className: "", style: {marginTop:-32,marginRight:30,fontWeight:600,fontSize:12,color:"#fff"}}, "ABOUT US"), 
        React.createElement("a", {href: "#pricing", className: "", style: {marginTop:-32,marginRight:30,fontWeight:600,fontSize:12,color:"#fff"}}, "PRICING")
        ), 

        React.createElement("a", {href: "#login", className: "btn btn-primary", style: {float:"right",marginTop:-40}}, "LOG IN"), 
        React.createElement("div", {className: "row", style: {marginTop:40}}, 
        React.createElement("div", {className: "col-md-6"}, 
          React.createElement("h1", null, 
            React.createElement("span", null, "Grow your career with the most advanced technology platform built for creators. "), " ", React.createElement("br", null)
          ), 
          React.createElement("hr", null), 
          React.createElement("br", null), 
          React.createElement("h2", {style: {marginTop:20,fontWeight:100}}, 
            React.createElement("div", {style: {color:"white"}}, 
              React.createElement("span", {style: {fontStyle:"italic"}}, "SHOWCASE "), 
              React.createElement("small", {style: {color:"white",fontWeight:100}}, "WE GIVE YOU TOOLS TO GROW YOUR CAREER AND ENHANCE YOUR PLATFORM"
              )
            ), 
            React.createElement("br", null), 
            React.createElement("div", {style: {color:"white"}}, 
              React.createElement("span", {style: {fontStyle:"italic"}}, "GROW "), 
              React.createElement("small", {style: {color:"white",fontWeight:100}}, "WE GIVE YOU TOOLS TO GROW YOUR CAREER AND ENHANCE YOUR PLATFORM"
              )
            ), 
            React.createElement("br", null), 
            React.createElement("div", {style: {color:"white"}}, 
              React.createElement("span", {style: {fontStyle:"italic"}}, "MONETIZE "), 
              React.createElement("small", {style: {color:"white",fontWeight:100}}, "WE GIVE YOU TOOLS TO GROW YOUR CAREER AND ENHANCE YOUR PLATFORM"
              )
            ), 
            React.createElement("span", {style: {fontStyle:"italic",display:"none"}}, 
              React.createElement("span", null, "BRAND BOOKINGS, &"), " ", React.createElement("br", null), 
              React.createElement("span", null, "PRODUCT PLACEMENTS")
          )), 
          React.createElement("span", {style: {display:"none"}}, 
            React.createElement("input", {type: "text", className: "form-control input-lg", style: {marginTop:30,width:300,borderRadius:2,fontSize:16}, placeholder: "EMAIL"}), 
            React.createElement("input", {type: "text", className: "form-control input-lg", style: {marginTop:10,width:300,borderRadius:2,fontSize:16}, placeholder: "PASSWORD", type: "password"}), 
            React.createElement("input", {type: "text", className: "form-control input-lg", style: {marginTop:10,width:300,borderRadius:2,fontSize:16}, placeholder: "CONFIRM PASSWORD", type: "password"}), 
            React.createElement("a", {className: "btn btn-lg btn-success", style: {marginTop:10,width:150,fontSize:16}}, "SIGN UP")
          )
        ), 

        React.createElement("div", {className: "col-md-6", style: {textAlign:"center"}}, 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("img", {src: "images/signaliq.png", style: {display:"none",height:450,float:"left",marginLeft:100,marginTop:20}}), 
          React.createElement("a", {href: "javascript:", className: "big-btn btn-lg btn btn-primary"}, "GET STARTED NOW  ", React.createElement("i", {className: "fa fa-arrow-right", style: {float:"right"}})), 
          React.createElement("br", null), 
          React.createElement("br", null)
        )
        )
      )
      )
      )
    )
  }
})


module.exports = LandingPage

});

;require.register("landing_page", function(exports, require, module) {
var LandingPage = React.createClass({displayName: 'LandingPage',
  home: function() {
    location.href="/#landing"
  },

  signUp: function() {
    data = {}
    $.ajax({
      url:location.origin+ "/signup",
      data: {},
      dataType:"json",
      success: function(res) {
        console.log(res)
        location.currentUser(res.token)
      },
      error: function(err) {
        console.log(err)
      }
    })
  },

  componentDidMount: function() {
    $('.form-control').floatlabel({
      labelClass:"floatingLabel",
      labelEndTop :"5px"
    });
  },

  render: function() {
    return (
      React.createElement("div", {style: {height:"100%",color:"white",fontFamily:"proxima-nova",overflow:"hidden"}}, 
        React.createElement("div", {className: "bg-gradient", style: {height:"100%",position:"relative",zIndex:20}}, 
          React.createElement("video", {src: "images/D18_9_310_preview.mp4", style: {position:"absolute",width:"100%",top:0,left:0,zIndex:1,opacity:0.1}, 
                playbackRate: 2, 
                loop: true, autoPlay: true}), 
        React.createElement("div", {className: "container", style: {position:"relative",zIndex:30,paddingTop:50}}, 

        React.createElement("h4", {style: {fontWeight:800,fontSize:22,cursor:"pointer"}, 
          onClick: this.home}, 
          React.createElement("img", {src: "images/infiq_white.png", style: {float:"left",height:25,marginRight:0}}), " " + ' ' +
          "InfluencerIQ"), 

        React.createElement("span", {style: {float:"right",marginTop:-32,marginRight:200}}, 
        React.createElement("a", {href: "#pricing", className: "", style: {marginTop:-32,marginRight:30,fontWeight:600,fontSize:12,color:"#fff"}}, "CREATORS"), 
        React.createElement("a", {href: "#pricing", className: "", style: {marginTop:-32,marginRight:30,fontWeight:600,fontSize:12,color:"#fff"}}, "BRANDS"), 
        React.createElement("a", {href: "#pricing", className: "", style: {marginTop:-32,marginRight:30,fontWeight:600,fontSize:12,color:"#fff"}}, "ABOUT US"), 
        React.createElement("a", {href: "#pricing", className: "", style: {marginTop:-32,marginRight:30,fontWeight:600,fontSize:12,color:"#fff"}}, "PRICING")
        ), 

        React.createElement("a", {href: "#login", className: "btn btn-primary", style: {float:"right",marginTop:-40}}, "LOG IN"), 
        React.createElement("div", {className: "row", style: {marginTop:40}}, 
        React.createElement("div", {className: "col-md-6"}, 
          React.createElement("h1", null, "Join The Leading Marketplace For Social Media Creators"), 
          React.createElement("br", null), 
          React.createElement("hr", null), 
          React.createElement("br", null), 
          React.createElement("h2", {style: {marginTop:20,fontWeight:100}}, "GAIN ACCESS TO EXCLUSIVE ", React.createElement("br", null), 
            React.createElement("br", null), 
            React.createElement("span", {style: {fontStyle:"italic"}}, 
              React.createElement("span", null, "BRAND PARTNERSHIPS, "), React.createElement("br", null), 
              React.createElement("span", null, "BRAND BOOKINGS, &"), " ", React.createElement("br", null), 
              React.createElement("span", null, "PRODUCT PLACEMENT OPPORTUNITIES")
          )), 
          React.createElement("span", {style: {display:"none"}}, 
            React.createElement("input", {type: "text", className: "form-control input-lg", style: {marginTop:30,width:300,borderRadius:2,fontSize:16}, placeholder: "EMAIL"}), 
            React.createElement("input", {type: "text", className: "form-control input-lg", style: {marginTop:10,width:300,borderRadius:2,fontSize:16}, placeholder: "PASSWORD", type: "password"}), 
            React.createElement("input", {type: "text", className: "form-control input-lg", style: {marginTop:10,width:300,borderRadius:2,fontSize:16}, placeholder: "CONFIRM PASSWORD", type: "password"}), 
            React.createElement("a", {className: "btn btn-lg btn-success", style: {marginTop:10,width:150,fontSize:16}}, "SIGN UP")
          )
        ), 

        React.createElement("div", {className: "col-md-6", style: {textAlign:"center"}}, 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("img", {src: "images/signaliq.png", style: {display:"none",height:450,float:"left",marginLeft:100,marginTop:20}}), 
          React.createElement("a", {href: "javascript:", className: "big-btn btn-lg btn btn-primary"}, "I'M A CREATOR  ", React.createElement("i", {className: "fa fa-arrow-right", style: {float:"right"}})), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("a", {href: "javascript:", className: "btn-lg btn btn-primary big-btn"}, "I'M A BRAND   ", React.createElement("i", {className: "fa fa-arrow-right", style: {float:"right"}}))
        )
        )
      )
      )
      )
    )
  }
})


module.exports = LandingPage

});

;require.register("landing_page_concept.js", function(exports, require, module) {
/** @jsx React.DOM */

var MarketingFooter = require('./marketing_footer.js.min.js');

module.exports = React.createClass({displayName: 'exports',
  // Landing Page
  login: function() {
    console.log('login')
    email = $('#email').val()
    password = $('#password').val()
    p = {"X-Parse-Application-Id": "N85QOkteEEQkuZVJKAvt8MVes0sjG6qNpEGqQFVJ",
         "X-Parse-REST-API-Key": "VN6EwVyBZwO1uphsBPsau8t7JQRp00UM3KYsiiQb"}
    $.ajax({
      url:'https://api.parse.com/1/login',
      headers: p,
      type:'GET',
      data: {
        'username':email,
        'password':password
      },
      success:function(res) {
        localStorage.setItem('currentUser', JSON.stringify(res))
        location.href = "#"
      },
      error: function(res) {
        console.log(res)
      }
    });
  },
  componentDidMount: function() {
    //particles()
  },

  render: function() {
    $('body').css({overflow:'auto'})

    return (
      React.createElement("div", {className: "particles-js", id: "particles-js"}, 
        React.createElement("nav", {className: "thenavbar navbar navbar-default", role: "navigation", style: {padding:70}}, 
          React.createElement("div", {className: "container-fluid", style: {fontFamily:'proxima-nova', fontSize:12}}, 
            React.createElement("a", {href: "#", style: {textDecoration:'none'}}, 
            React.createElement("img", {className: "logo-img", src: "build/img/social_spark_logo.png"}), 
            React.createElement("span", {className: "logo-text"}, 
            "SocialSpark"
          )
          ), 
              React.createElement("ul", {className: "nav nav-pills landing-page-nav", role: "tablist", style: {marginRight:0,fontSize:11,marginTop:-70,display:'none'}}, 
                React.createElement("li", null, React.createElement("a", {className: "landing-page-nav-tab", style: {display:'block'}, href: "#login"}, "LOGIN")), 
                React.createElement("li", null, React.createElement("a", {className: "landing-page-nav-tab", style: {display:'block'}, href: "http://resources.customerohq.com/v1.0/blog"}, "BLOG")), 
                React.createElement("li", null, React.createElement("a", {className: "landing-page-nav-tab", href: "http://resources.customerohq.com"}, "RESOURCES")), 
                React.createElement("li", null, React.createElement("a", {className: "landing-page-nav-tab", href: "http://resources.customerohq.com/v1.0/discuss"}, "KNOWLEDGE BASE")), 
                React.createElement("li", null, React.createElement("a", {className: "landing-page-nav-tab", href: "#"}, "+1905-616-7602 ", React.createElement("i", {className: "fa fa-phone"})))
              )
          ), 
          React.createElement("a", {href: "#login", className: "btn-lg btn login-btn", style: {fontFamily:'proxima-nova'}}, "LOGIN"), 
              React.createElement("ul", {className: "nav nav-pills landing-page-nav", role: "tablist", style: {width:600,fontSize:13,marginRight:100,marginTop:-45,display:'none'}}, 
                React.createElement("li", {style: {width:'24%',textAlign:'center',display:'block'}}, " "), 
                React.createElement("li", {style: {width:'24%',textAlign:'center',display:'none'}}, 
                  React.createElement("a", {className: "landing-page-nav-tab lp-bottom-nav", style: {display:'block'}, href: "#"}, "PRODUCT")), 
                React.createElement("li", {style: {width:'24%',textAlign:'center',display:'none'}}, 
                  React.createElement("a", {className: "landing-page-nav-tab lp-bottom-nav", style: {display:'block'}, href: "#"}, "DATA")), 
                React.createElement("li", {style: {width:'24%',textAlign:'center'}}, React.createElement("a", {className: "landing-page-nav-tab lp-bottom-nav", style: {display:'block'}, href: "#product/features"}, "FEATURES")), 
                React.createElement("li", {style: {width:'24%',textAlign:'center',display:'none'}}, 
                  React.createElement("a", {className: "landing-page-nav-tab lp-bottom-nav", style: {display:'block'}, href: "#"}, "INTEGRATIONS")), 
                React.createElement("li", {style: {width:'24%',textAlign:'center'}}, React.createElement("a", {className: "landing-page-nav-tab lp-bottom-nav", style: {display:'block'}, href: "#pricing"}, "PRICING")), 
                React.createElement("li", {style: {width:'24%',textAlign:'center'}}, React.createElement("a", {className: "landing-page-nav-tab lp-bottom-nav", style: {display:'block'}, href: "#services"}, "SERVICES"))
              )
        ), 

        React.createElement("div", {className: "row", style: {margin:0}}, 
        React.createElement("div", {className: "gradient-4"}), 
        React.createElement("div", {className: "the-background-image"}), 
        React.createElement("div", {className: "col-md-12 col-sm-12", style: {paddingTop:'80px'}, id: ""}, 
          React.createElement("div", {style: {display:'none'}}, 
          React.createElement("h1", {style: {color:'#1ca3fd',fontWeight:'100',color:'white',textAlign:'center',fontSize:'38px',fontFamily:'Open Sans',fontSize:'40px'}}, 
            "Generate High Quality Prospect Lists" 
          ), 
          React.createElement("h1", {style: {color:'#1ca3fd',fontWeight:'100',textAlign:'center',color:'white',fontSize:'46px',fontFamily:'Open Sans', fontStyle:'italic'}}, 
            "Find New Customers Faster"
          )
          ), 
          React.createElement("a", {href: "#signup", className: "btn-lg btn-success btn start-trial"}, "Start Your Free Trial Today"), 

          React.createElement("div", {className: "panel panel-default", style: {display:'none'}}, 
          React.createElement("div", {className: "panel-heading"}, " "), 
            React.createElement("div", {className: "panel-body"}, 
              React.createElement("form", {onSubmit: this.login}, 
              React.createElement("input", {placeholder: "Email", id: "email", type: "text", className: "form-control input-lg", style: {fontWeight:'100',fontSize:'22px'}}), 
              React.createElement("br", null), 
              React.createElement("input", {placeholder: "Password", type: "password", id: "password", className: "form-control input-lg", style: {fontWeight:'100',fontSize:'22px'}}), 
              React.createElement("br", null), 

              React.createElement("a", {href: "javascript:", onClick: this.login, className: "btn btn-success btn-lg", style: {display:'block',backgroundColor:'#1ca3fd'}}, "Log In")
              )
            ), 
          React.createElement("div", {className: "panel-footer"}, " "), 
        React.createElement("div", {className: "the-gradient-1"})
          )
        )
      ), 

        React.createElement("div", {className: "container product-header chrome-bar", 
             style: {height:100,paddingTop:45, marginTop:113, display:'none'}}, 
             React.createElement("div", {className: "col-md-4", style: {textAlign:'center',fontFamily:'proxima-nova', fontSize:12}}, React.createElement("i", {className: "fa fa-line-chart"}), " GROW PIPELINE FAST"), 
          React.createElement("div", {className: "col-md-4", style: {textAlign:'center',fontFamily:'proxima-nova', fontSize:12}}, React.createElement("i", {className: "fa fa-search"}), " IDENTIFY HIGH-VALUE PROSPECTS"), 
          React.createElement("div", {className: "col-md-4", style: {textAlign:'center',fontFamily:'proxima-nova', fontSize:12}}, React.createElement("i", {className: "fa fa-coffee"}), " CONNECT WITH DECISION MAKERS  ")
        ), 



      React.createElement("div", {style: {borderBottom: '1px solid #edeeef', borderTop: '1px solid #edeeef', 
                   paddingTop:50, backgroundColor:'#f5f8fa', display:'none'}}, 
        React.createElement("div", {className: "container"}, 
          React.createElement("div", {className: "row", style: {height:200, textAlign:'center'}}, 
            React.createElement("h2", null, "Give Customero a try. Free 14-day trial available for all plans."), 
            React.createElement("br", null), 
            React.createElement("a", {href: "#signup", className: "btn btn-success btn-lg start-trial", style: {marginTop:10}}, 
              "START A NO-RISK FREE TRIAL  ", React.createElement("i", {className: "fa fa-chevron-right", style: {fontSize:18}})
            )
          )
        )
      ), 

      React.createElement("div", {class: "tmp-footer"})

      )
    );
  }
});

});

require.register("login.js", function(exports, require, module) {
/** @jsx React.DOM */

var _Parse = require("../lib/parse-require.min.js")
theData = require('../lib/data.min.js') 

module.exports = React.createClass({displayName: 'exports',
  // SignUp
  componentDidMount: function() {
    //$('body').css({overflow:'hidden'})
    var thiss = this;
    $("input").keypress(function(event) {
        if (event.which == 13) {
          event.preventDefault();
          thiss.login()
        }
    });
  },

  login: function() {
    console.log('login')
    $.ajax({
      url:'https://api.parse.com/1/login',
      //headers: appConfig.headers,
      headers: _Parse.headers,
      type:'GET',
      data: {
        'username':$('#email').val(),
        'password':$('#password').val()
      },
      beforeSend: function() { },
      success:function(res) {
        //alertify.success('Logging in...')
        localStorage.setItem('currentUser', JSON.stringify(res))
        location.href = "#"
        Parse = _Parse()
      },
      error: function(res) {
        alertify.error('There was an error with your login request. Please try again')
      }
    });
  },

  render: function() { 
    data = theData()
    imgs_1 = []
    imgs_2 = []
    for(i=0;i < 120; i++) {
      imgs_1.push(React.createElement("img", {src: data[i], className: "prospect-img"}))
    }
    for(i=15;i < 30; i++) {
      imgs_2.push(React.createElement("img", {src: data[i], className: "prospect-img"}))
    }

  console.log(data)
    return (
      React.createElement("div", {style: {height:'100%'}}, 
      React.createElement("div", {id: "signup", style: {paddingTop:50}}, 
        React.createElement("h1", {className: "title"}, "SocialSpark."), 
        React.createElement("h5", {className: "tagline"}, " "), 
          React.createElement("div", {className: "panel panel-default login-info", style: {display:'block'}}, 
            React.createElement("div", {className: "panel-body", style: {fontFamily:'proxima-nova',fontWeight:'bold'}}, 
              React.createElement("form", {onSubmit: this.login}, 
              React.createElement("input", {placeholder: "Email", id: "email", type: "text", className: "form-control input-lg"}), 
              React.createElement("br", null), 
              React.createElement("input", {placeholder: "Password", type: "password", id: "password", className: "form-control input-lg"}), 
              React.createElement("br", null), 

              React.createElement("a", {href: "javascript:", onClick: this.login, className: "btn btn-gradient btn-lg btn-primary", style: {borderRadius:3, display:'block',backgroundColor:'#1ca3fd',fontFamily:'proxima-nova',fontWeight:'bold'}}, "LOG IN")

              )
            )
          )
      ), 

        React.createElement("div", {id: "", style: {position:'absolute',zIndex:'-2',top:0,left:0}}, 
          React.createElement("div", {className: "", style: {marginLeft:34, display:'none'}}, 
          imgs_1, 
          imgs_2
          )
        )
      )
    )
  }
});

});

require.register("login", function(exports, require, module) {
var Login = React.createClass({displayName: 'Login',
  loginUser: function() {
    data = {}
    $.ajax({
      url:location.origin+ "/login",
      data: {},
      dataType:"json",
      // auth token: ""
      success: function(res) {
        console.log(res)
        location.currentUser(res.token)
        // location.href="/#/signals"
      },
      error: function(err) {
        console.log(err)
      }
    })
  },

  componentDidMount: function() {
    $('.login-form .form-control').floatlabel({
      labelClass:"floatingLabel",
      labelEndTop :"5px"
    });
  },

  render: function() {
    return (
      React.createElement("div", {style: {height:"100%"}, className: "coral-purple"}, 
      React.createElement("div", {style: {width:320,textAlign:"center",paddingTop:120}, className: "col-md-2 col-md-offset-4  login-form"}, 
        React.createElement("i", {className: "fa fa-lightbulb-o", style: {fontSize:60,color:"white"}}), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("h5", {style: {color:"white",fontWeight:800}}, " SUPPORT THE MAKERS YOU LOVE "), 
          React.createElement("br", null), 
        React.createElement("input", {type: "text", className: "form-control input-lg", style: {fontSize:16, marginRight:"auto",marginLeft:"auto",marginTop:30,width:300,borderRadius:2}, placeholder: "EMAIL"}), 
        React.createElement("input", {className: "form-control input-lg", style: {fontSize:16, marginTop:10,marginLeft:"auto",marginRight:"auto",width:300,borderRadius:2}, placeholder: "PASSWORD", type: "password"}), 
        React.createElement("br", null), 
        React.createElement("a", {className: "btn btn-lg btn-primary", 
          onClick: this.loginUser, 
          style: {marginTop:10,width:300, fontSize:16}}, "LOG IN")
      )
    )
    )
  }
})

module.exports = Login

});

;require.register("marketing_footer.js", function(exports, require, module) {

module.exports = React.createClass({displayName: 'exports',
  render: function() {
    return (
      React.createElement("div", {className: "container footer", style: {marginTop:50}}, 
      React.createElement("div", {className: "row", style: {fontFamily:"proxima-nova"}}, 
        React.createElement("div", {className: "col-md-2 col-sm-2 col-xs-2"}, 
          React.createElement("h5", null, "PRODUCT"), 
          React.createElement("ul", {className: "list-unstyled"}, 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Overview")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Customers")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Pricing")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Security"))
          )
        ), 
        React.createElement("div", {className: "col-md-2 col-sm-2 col-xs-2"}, 
          React.createElement("h5", null, "FEATURES"), 
          React.createElement("ul", {className: "list-unstyled"}, 
          React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Signals")), 
          React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Mining Jobs")), 
          React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Territory Management")), 
          React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Social Prospect Data")), 
          React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Campaigns")), 
          React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "CRM Integration"))
          )
        ), 
        React.createElement("div", {className: "col-md-2 col-sm-2 col-xs-2"}, 
          React.createElement("h5", null, "ROLES"), 
          React.createElement("ul", {className: "list-unstyled"}, 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Sales Leaders")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Sales Professionals")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "CIO and IT")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Sales Ops"))
          ), 
          React.createElement("br", null), 
          React.createElement("h5", null, "SOLUTIONS"), 
          React.createElement("ul", {className: "list-unstyled"}, 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Small Business")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Mid-Market")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Enterprise"))
          )
        ), 
        React.createElement("div", {className: "col-md-2 col-sm-2 col-xs-2"}, 
          React.createElement("h5", null, "COMPANY"), 
          React.createElement("ul", {className: "list-unstyled"}, 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "About")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Careers")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Partner Program")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Press")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Blog"))
          )
        ), 
        React.createElement("div", {className: "col-md-2 col-sm-2 col-xs-2"}, 
          React.createElement("h5", null, "COMMUNITY"), 
          React.createElement("ul", {className: "list-unstyled"}, 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Facebook")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Twitter")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Linkedin")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Free Resources")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Sales Blog"))
          )
        ), 
        React.createElement("div", {className: "col-md-2 col-sm-2 col-xs-2"}, 
          React.createElement("h5", null, "HELP AND SUPPORT"), 
          React.createElement("ul", {className: "list-unstyled"}, 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Support Center")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Developer Tools")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:"}, "Contact Us"))
          ), 
          React.createElement("br", null), 
          React.createElement("h5", {style: {color:'#0084ff',fontWeight:'bold',fontSize:12}}, "ACCOUNT"), 
          React.createElement("ul", {className: "list-unstyled text-muted"}, 
            React.createElement("li", null, React.createElement("a", {href: "javascript:", className: "text-muted"}, "Sign Up")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:", className: "text-muted"}, "Login")), 
            React.createElement("li", null, React.createElement("a", {href: "javascript:", className: "text-muted"}, "Forgot Password"))
          )
        )
      ), 
      React.createElement("hr", null), 
      React.createElement("h6", {className: "text-muted", style: {marginTop:-10}}, 
        React.createElement("i", {className: "fa fa-copyright"}), " " + ' ' +
        "Customero 2014"
      ), 
      React.createElement("div", {className: "text-muted", style: {float:'right',marginTop:-35}}, 
        React.createElement("h6", null, 
        React.createElement("a", {href: "javascript:", className: "text-muted"}, "Facebook"), "   ", 
        React.createElement("a", {href: "javascript:", className: "text-muted"}, "Twitter"), "   ", 
        React.createElement("a", {href: "javascript:", className: "text-muted"}, "Linkedin"), "   "
      )
      )
    )
    )
  },

  componentDidMount: function() {
    $('.footer a').addClass('text-muted')
    $('.footer h5').css({color:'#0084ff',fontWeight:'bold',fontSize:12})
  }
})

});

;require.register("mc_landing", function(exports, require, module) {
var LandingPage = React.createClass({displayName: 'LandingPage',
  home: function() {
    location.href="/#landing"
  },

  signUp: function() {
    data = {}
    $.ajax({
      url:location.origin+ "/signup",
      data: {},
      dataType:"json",
      success: function(res) {
        console.log(res)
        location.currentUser(res.token)
      },
      error: function(err) {
        console.log(err)
      }
    })
  },

  componentDidMount: function() {
    $('.form-control').floatlabel({
      labelClass:"floatingLabel",
      labelEndTop :"5px"
    });
  },

  render: function() {
    return (
      React.createElement("div", {style: {height:"100%",color:"white",fontFamily:"proxima-nova",overflow:"hidden"}}, 
        React.createElement("div", {className: "bg-gradient-1", style: {height:"100%",position:"relative",zIndex:20}}, 
          React.createElement("img", {src: "images/mc_bg.jpg", style: {position:"absolute",width:"100%",top:0,left:0,zIndex:1,opacity:0.3}}), 
          React.createElement("video", {src: "images/D18_9_310_preview.mp4", style: {position:"absolute",width:"100%",top:0,left:0,zIndex:1,opacity:0.1,display:"none"}, 
                playbackRate: 2, 
                loop: true, autoPlay: true}), 
        React.createElement("div", {className: "container", style: {position:"relative",zIndex:30,paddingTop:50}}, 

        React.createElement("h4", {style: {fontWeight:800,fontSize:22,cursor:"pointer"}, 
          onClick: this.home}, 
          React.createElement("i", {className: "fa fa-lightbulb-o", style: {marginRight:5}}), 
          "MakersClub"), 

        React.createElement("span", {style: {float:"right",marginTop:-32,marginRight:200,display:"none"}}, 
        React.createElement("a", {href: "#pricing", className: "", style: {marginTop:-32,marginRight:30,fontWeight:600,fontSize:12,color:"#fff"}}, "CREATORS"), 
        React.createElement("a", {href: "#pricing", className: "", style: {marginTop:-32,marginRight:30,fontWeight:600,fontSize:12,color:"#fff"}}, "BRANDS"), 
        React.createElement("a", {href: "#pricing", className: "", style: {marginTop:-32,marginRight:30,fontWeight:600,fontSize:12,color:"#fff"}}, "ABOUT US"), 
        React.createElement("a", {href: "#pricing", className: "", style: {marginTop:-32,marginRight:30,fontWeight:600,fontSize:12,color:"#fff"}}, "PRICING")
        ), 

        React.createElement("a", {href: "#login", className: "btn btn-primary big-btn", style: {width:"auto",padding:8,float:"right",marginTop:-40}}, "LOG IN"), 
        React.createElement("div", {className: "row", style: {marginTop:40}}, 
        React.createElement("div", {className: "col-md-12", style: {textAlign:"center"}}, 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("h1", {style: {fontSize:50}}, "Recurring Funding For Makers And Builders "), 
          React.createElement("br", null), 
          React.createElement("h3", null, 
              "Allowing Makers To Make A Living Without Relying On Advertising"
          ), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("div", {className: "col-md-6"}, 
            React.createElement("a", {href: "javascript:", className: "big-btn btn-lg btn btn-primary"}, "I'M A MAKER  ", React.createElement("i", {className: "fa fa-arrow-right", style: {float:"right"}}))
          ), 
          React.createElement("div", {className: "col-md-6"}, 
            React.createElement("a", {href: "javascript:", className: "big-btn btn-lg btn btn-primary"}, "I'M A SUPPORTER  ", React.createElement("i", {className: "fa fa-arrow-right", style: {float:"right"}}))
          )
        ), 
        React.createElement("div", {className: "col-md-6", style: {display:"none"}}, 
          React.createElement("h1", null, "Join The Leading Marketplace For Social Media Creators"), 
          React.createElement("br", null), 
          React.createElement("hr", null), 
          React.createElement("br", null), 
          React.createElement("h2", {style: {marginTop:20,fontWeight:100}}, "GAIN ACCESS TO EXCLUSIVE ", React.createElement("br", null), 
            React.createElement("br", null), 
            React.createElement("span", {style: {fontStyle:"italic"}}, 
              React.createElement("span", null, "BRAND PARTNERSHIPS, "), React.createElement("br", null), 
              React.createElement("span", null, "BRAND BOOKINGS, &"), " ", React.createElement("br", null), 
              React.createElement("span", null, "PRODUCT PLACEMENT OPPORTUNITIES")
          )), 
          React.createElement("span", {style: {display:"none"}}, 
            React.createElement("input", {type: "text", className: "form-control input-lg", style: {marginTop:30,width:300,borderRadius:2,fontSize:16}, placeholder: "EMAIL"}), 
            React.createElement("input", {type: "text", className: "form-control input-lg", style: {marginTop:10,width:300,borderRadius:2,fontSize:16}, placeholder: "PASSWORD", type: "password"}), 
            React.createElement("input", {type: "text", className: "form-control input-lg", style: {marginTop:10,width:300,borderRadius:2,fontSize:16}, placeholder: "CONFIRM PASSWORD", type: "password"}), 
            React.createElement("a", {className: "btn btn-lg btn-success", style: {marginTop:10,width:150,fontSize:16}}, "SIGN UP")
          )
        ), 

        React.createElement("div", {className: "col-md-6", style: {textAlign:"center",display:"none"}}, 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("img", {src: "images/signaliq.png", style: {display:"none",height:450,float:"left",marginLeft:100,marginTop:20}}), 
          React.createElement("a", {href: "javascript:", className: "big-btn btn-lg btn btn-primary"}, "I'M A CREATOR  ", React.createElement("i", {className: "fa fa-arrow-right", style: {float:"right"}})), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("a", {href: "javascript:", className: "btn-lg btn btn-primary big-btn"}, "I'M A BRAND   ", React.createElement("i", {className: "fa fa-arrow-right", style: {float:"right"}}))
        )
        )
      )
      )
      )
    )
  }
})


module.exports = LandingPage

});

;require.register("mousetrap.min", function(exports, require, module) {
/* mousetrap v1.4.6 craig.is/killing/mice */
(function(J,r,f){function s(a,b,d){a.addEventListener?a.addEventListener(b,d,!1):a.attachEvent("on"+b,d)}function A(a){if("keypress"==a.type){var b=String.fromCharCode(a.which);a.shiftKey||(b=b.toLowerCase());return b}return h[a.which]?h[a.which]:B[a.which]?B[a.which]:String.fromCharCode(a.which).toLowerCase()}function t(a){a=a||{};var b=!1,d;for(d in n)a[d]?b=!0:n[d]=0;b||(u=!1)}function C(a,b,d,c,e,v){var g,k,f=[],h=d.type;if(!l[a])return[];"keyup"==h&&w(a)&&(b=[a]);for(g=0;g<l[a].length;++g)if(k=
l[a][g],!(!c&&k.seq&&n[k.seq]!=k.level||h!=k.action||("keypress"!=h||d.metaKey||d.ctrlKey)&&b.sort().join(",")!==k.modifiers.sort().join(","))){var m=c&&k.seq==c&&k.level==v;(!c&&k.combo==e||m)&&l[a].splice(g,1);f.push(k)}return f}function K(a){var b=[];a.shiftKey&&b.push("shift");a.altKey&&b.push("alt");a.ctrlKey&&b.push("ctrl");a.metaKey&&b.push("meta");return b}function x(a,b,d,c){m.stopCallback(b,b.target||b.srcElement,d,c)||!1!==a(b,d)||(b.preventDefault?b.preventDefault():b.returnValue=!1,b.stopPropagation?
b.stopPropagation():b.cancelBubble=!0)}function y(a){"number"!==typeof a.which&&(a.which=a.keyCode);var b=A(a);b&&("keyup"==a.type&&z===b?z=!1:m.handleKey(b,K(a),a))}function w(a){return"shift"==a||"ctrl"==a||"alt"==a||"meta"==a}function L(a,b,d,c){function e(b){return function(){u=b;++n[a];clearTimeout(D);D=setTimeout(t,1E3)}}function v(b){x(d,b,a);"keyup"!==c&&(z=A(b));setTimeout(t,10)}for(var g=n[a]=0;g<b.length;++g){var f=g+1===b.length?v:e(c||E(b[g+1]).action);F(b[g],f,c,a,g)}}function E(a,b){var d,
c,e,f=[];d="+"===a?["+"]:a.split("+");for(e=0;e<d.length;++e)c=d[e],G[c]&&(c=G[c]),b&&"keypress"!=b&&H[c]&&(c=H[c],f.push("shift")),w(c)&&f.push(c);d=c;e=b;if(!e){if(!p){p={};for(var g in h)95<g&&112>g||h.hasOwnProperty(g)&&(p[h[g]]=g)}e=p[d]?"keydown":"keypress"}"keypress"==e&&f.length&&(e="keydown");return{key:c,modifiers:f,action:e}}function F(a,b,d,c,e){q[a+":"+d]=b;a=a.replace(/\s+/g," ");var f=a.split(" ");1<f.length?L(a,f,b,d):(d=E(a,d),l[d.key]=l[d.key]||[],C(d.key,d.modifiers,{type:d.action},
c,a,e),l[d.key][c?"unshift":"push"]({callback:b,modifiers:d.modifiers,action:d.action,seq:c,level:e,combo:a}))}var h={8:"backspace",9:"tab",13:"enter",16:"shift",17:"ctrl",18:"alt",20:"capslock",27:"esc",32:"space",33:"pageup",34:"pagedown",35:"end",36:"home",37:"left",38:"up",39:"right",40:"down",45:"ins",46:"del",91:"meta",93:"meta",224:"meta"},B={106:"*",107:"+",109:"-",110:".",111:"/",186:";",187:"=",188:",",189:"-",190:".",191:"/",192:"`",219:"[",220:"\\",221:"]",222:"'"},H={"~":"`","!":"1",
"@":"2","#":"3",$:"4","%":"5","^":"6","&":"7","*":"8","(":"9",")":"0",_:"-","+":"=",":":";",'"':"'","<":",",">":".","?":"/","|":"\\"},G={option:"alt",command:"meta","return":"enter",escape:"esc",mod:/Mac|iPod|iPhone|iPad/.test(navigator.platform)?"meta":"ctrl"},p,l={},q={},n={},D,z=!1,I=!1,u=!1;for(f=1;20>f;++f)h[111+f]="f"+f;for(f=0;9>=f;++f)h[f+96]=f;s(r,"keypress",y);s(r,"keydown",y);s(r,"keyup",y);var m={bind:function(a,b,d){a=a instanceof Array?a:[a];for(var c=0;c<a.length;++c)F(a[c],b,d);return this},
unbind:function(a,b){return m.bind(a,function(){},b)},trigger:function(a,b){if(q[a+":"+b])q[a+":"+b]({},a);return this},reset:function(){l={};q={};return this},stopCallback:function(a,b){return-1<(" "+b.className+" ").indexOf(" mousetrap ")?!1:"INPUT"==b.tagName||"SELECT"==b.tagName||"TEXTAREA"==b.tagName||b.isContentEditable},handleKey:function(a,b,d){var c=C(a,b,d),e;b={};var f=0,g=!1;for(e=0;e<c.length;++e)c[e].seq&&(f=Math.max(f,c[e].level));for(e=0;e<c.length;++e)c[e].seq?c[e].level==f&&(g=!0,
b[c[e].seq]=1,x(c[e].callback,d,c[e].combo,c[e].seq)):g||x(c[e].callback,d,c[e].combo);c="keypress"==d.type&&I;d.type!=u||w(a)||c||t(b);I=g&&"keydown"==d.type}};J.Mousetrap=m;"function"===typeof define&&define.amd&&define(m)})(window,document);

});

require.register("navbar", function(exports, require, module) {
var NavBar = React.createClass({displayName: 'NavBar',
  signOut: function() {
    localStorage.clear()
    location.href = "#"
  },
  render: function() {
    return (
      React.createElement("div", {className: "navbar"}, 
        React.createElement("div", {style: {paddingLeft:20, paddingTop:5}}, 
            React.createElement("img", {className: "app-logo-img", src: "images/infiq_black.png", style: {paddingTop:17,display:"none"}}), 
            React.createElement("span", {className: "app-logo-text", style: {color:'black',fontWeight:800}}, 
              React.createElement("i", {className: "fa fa-lightbulb-o", style: {marginRight:5}}), 
              "MakersClub"
          ), 

          React.createElement("span", {style: {display:"none"}}, 
          React.createElement("div", {className: "search-btn", style: {backgroundImage:'url("images/user.png")', backgroundSize:'cover'}}
          ), 

          React.createElement("div", {className: "search-btn", onClick: this.signOut}, 
            React.createElement("i", {className: "fa fa-sign-out"})
          ), 

          React.createElement("div", {className: "search-btn"}, 
            React.createElement("i", {className: "fa fa-bell"})
          ), 

          React.createElement("div", {className: "search-btn"}, 
            React.createElement("i", {className: "fa fa-search"})
          )
          )

        )
      )
    )
  }
})

module.exports = NavBar

});

;require.register("old_signup", function(exports, require, module) {
/** @jsx React.DOM */

theData = require('../lib/data.min.js') 
var _Parse = require("../lib/parse-require.min.js")

module.exports = React.createClass({displayName: 'exports',
  // SignUp
  componentDidMount: function() {
    //$('body').css({overflow:'hidden'})
    //$('body').css({overflow:'hidden'})
    var thiss = this;
    $("input").keypress(function(event) {
        if (event.which == 13) {
          event.preventDefault();
          thiss.signup()
        }
    });
  },

  retrieveUser: function(objectId) {
    $.ajax({
      url:'https://api.parse.com/1/users/'+objectId,
      //headers: appConfig.headers,
      headers: _Parse.headers,
      type:'GET',
      success:function(res) {
        localStorage.setItem('currentUser', JSON.stringify(res))
        location.href = "#"
      },
      error: function(res) {
        console.log(res)
      }
    });
  },

  signup: function() {
    console.log('signup')
    email = $('#email').val().trim()
    password = $('#password').val().trim()
    thiss = this;
    if($('#company').val().trim() == "" || email == "" || password == ""){
      alertify.error('There was an error with your registration request. Please try again')
      return 0
      
    }

    data = JSON.stringify({ 'name': $('#company').val() }),
    Parse.create("UserCompany", data).then(function(res) {
      console.log(res)
      userData = JSON.stringify({
        'username':email,
        'password': password,
        'accountType':'trial',
        'user_company':{
          '__type'    : 'Pointer',
          'className' : 'UserCompany',
          'objectId'  : res.objectId,
        }
      })
      Parse.create("User", userData).then(function(res) {
        console.log(res)
        Parse.getObject("User", res.objectId).then(function(res) { 
            console.log(res)
            localStorage.setItem('currentUser', JSON.stringify(res))
            location.href = "#"
        })
      })
    })

    /*
    $.ajax({
      url:'https://api.parse.com/1/classes/UserCompany',
      type:'POST',
      //headers: appConfig.headers,
      headers: _Parse.headers,
      data: JSON.stringify({ 'name': $('#company').val() }),
      success:function(res) {
        $.ajax({
          url:'https://api.parse.com/1/users',
          type:'POST',
          headers: appConfig.headers,
          data: JSON.stringify({
            'username':email,
            'password': password,
            'accountType':'trial',
            'user_company':{
              '__type'    : 'Pointer',
              'className' : 'UserCompany',
              'objectId'  : res.objectId,
            }
            // people_archive_list
            // company_archive_list
            // ClearSpark - api_key
          }),
          success:function(res) {
            // Do another request to get current user
            localStorage.setItem('currentUser', JSON.stringify(res))
            thiss.retrieveUser(res.objectId)
          },
          error: function(res) {
            console.log(res)
            alertify.error('There was an error with your registration request. Please try again')
          }
        });
      },
      error: function(res) {
        console.log(res)
        alertify.error('There was an error with your registration request. Please try again')
      }
    });
    */
  },

  render: function() { 
    data = theData()
    imgs_1 = []
    imgs_2 = []
    for(i=0;i < 120; i++) {
      imgs_1.push(React.createElement("img", {src: data[i], className: "prospect-img"}))
    }
    for(i=15;i < 30; i++) {
      imgs_2.push(React.createElement("img", {src: data[i], className: "prospect-img"}))
    }

    return (
      React.createElement("div", {id: "signup", style: {marginTop:0}}, 

      React.createElement("div", {style: {paddingTop:100}}, 
        React.createElement("h1", {className: "title"}, "SocialSpark."), 
        React.createElement("h5", {className: "tagline"}, " "), 
          React.createElement("div", {className: "panel panel-default login-info", style: {display:'block',marginTop:50}}, 
            React.createElement("div", {className: "panel-body", style: {fontFamily:'proxima-nova',fontWeight:'bold'}}, 
              React.createElement("form", {onSubmit: this.login}, 
              React.createElement("input", {placeholder: "Email", id: "email", type: "text", className: "form-control input-lg"}), 
              React.createElement("br", null), 
              React.createElement("input", {placeholder: "Company", type: "text", id: "company", className: "form-control input-lg"}), 
              React.createElement("br", null), 
              React.createElement("input", {placeholder: "Password", type: "password", id: "password", className: "form-control input-lg"}), 
              React.createElement("br", null), 
              React.createElement("input", {placeholder: "Repeat Password", type: "password", id: "repeat_password", className: "form-control input-lg"}), 
              React.createElement("br", null), 
              React.createElement("a", {href: "javascript:", onClick: this.signup, className: "btn btn-primary btn-lg", style: {display:'block',backgroundColor:'#1ca3fd', backgroundImage: 'linear-gradient(180deg, #0096ff 0%, #005dff 100%)',borderRadius:3,fontFamily:'proxima-nova',fontWeight:'bold'}}, "Sign Up")
              )
            )
          )
      ), 

      React.createElement("div", {id: "", style: {position:'absolute',zIndex:'-2',top:0,left:0}}, 
        React.createElement("div", {className: "", style: {marginLeft:0,width:'120%',display:'none'}}, 
        imgs_1, 
        imgs_2
        )
      )
      )
    )
  }
});

});

require.register("papaparse.min", function(exports, require, module) {
/*
 *  Papa Parse
 *    v3.0.1
 *      https://github.com/mholt/PapaParse
 *      */
;(function(e){"use strict";function u(e,n){var r=t?n:g(n);var i=r.worker&&Papa.WORKERS_SUPPORTED;if(i){var s=d();s.userStep=r.step;s.userComplete=r.complete;s.userError=r.error;r.step=b(r.step);r.complete=b(r.complete);r.error=b(r.error);delete r.worker;s.postMessage({input:e,config:r,workerId:s.id})}else{if(typeof e==="string"){if(r.download){var o=new f(r);o.stream(e)}else{var u=new c(r);var a=u.parse(e);if(b(r.complete))r.complete(a);return a}}else if(e instanceof File){if(r.step){var o=new l(r);o.stream(e)}else{var u=new c(r);if(t){var h=new FileReaderSync;var p=h.readAsText(e,r.encoding);return u.parse(p)}else{h=new FileReader;h.onload=function(e){var t=new c(r);var n=t.parse(e.target.result);if(b(r.complete))r.complete(n)};h.readAsText(e,r.encoding)}}}}}function a(t,n){function a(){if(typeof n!=="object")return;if(typeof n.delimiter==="string"&&n.delimiter.length==1&&e.Papa.BAD_DELIMITERS.indexOf(n.delimiter)==-1){o=n.delimiter}if(typeof n.quotes==="boolean")s=n.quotes;if(typeof n.newline==="string")u=n.newline}function f(e){if(typeof e!=="object")return[];var t=[];for(var n in e)t.push(n);return t}function l(e,t){var n="";if(typeof e==="string")e=JSON.parse(e);if(typeof t==="string")t=JSON.parse(t);var r=e instanceof Array&&e.length>0;var i=!(t[0]instanceof Array);if(r){for(var s=0;s<e.length;s++){if(s>0)n+=o;n+=c(e[s])}if(t.length>0)n+=u}for(var a=0;a<t.length;a++){var f=r?e.length:t[a].length;for(var l=0;l<f;l++){if(l>0)n+=o;var h=r&&i?e[l]:l;n+=c(t[a][h])}if(a<t.length-1)n+=u}return n}function c(t){if(typeof t==="undefined")return"";t=t.toString().replace(/"/g,'""');var n=s||h(t,e.Papa.BAD_DELIMITERS)||t.indexOf(o)>-1||t.charAt(0)==" "||t.charAt(t.length-1)==" ";return n?'"'+t+'"':t}function h(e,t){for(var n=0;n<t.length;n++)if(e.indexOf(t[n])>-1)return true;return false}var r="";var i=[];var s=false;var o=",";var u="\r\n";a();if(typeof t==="string")t=JSON.parse(t);if(t instanceof Array){if(!t.length||t[0]instanceof Array)return l(null,t);else if(typeof t[0]==="object")return l(f(t[0]),t)}else if(typeof t==="object"){if(typeof t.data==="string")t.data=JSON.parse(t.data);if(t.data instanceof Array){if(!t.fields)t.fields=t.data[0]instanceof Array?t.fields:f(t.data[0]);if(!(t.data[0]instanceof Array)&&typeof t.data[0]!=="object")t.data=[t.data];return l(t.fields,t.data)}}throw"exception: Unable to serialize unrecognized input"}function f(n){n=n||{};if(!n.chunkSize)n.chunkSize=1024*1024*5;var r=0,i=0;var s="";var o="";var u,a;var f=new c(y(n));this.stream=function(l){function c(){u=new XMLHttpRequest;if(!t){u.onload=h;u.onerror=p}u.open("GET",l,!t);if(n.step){var e=r+n.chunkSize-1;if(i&&e>i)e=i;u.setRequestHeader("Range","bytes="+r+"-"+e)}u.send();if(t&&u.status==0)p();else r+=n.chunkSize}function h(){if(u.readyState!=4)return;if(u.status<200||u.status>=400){p();return}s+=o+u.responseText;o="";var i=!n.step||r>d(u);if(!i){var l=s.lastIndexOf("\n");if(l<0)l=s.lastIndexOf("\r");if(l>-1){o=s.substring(l+1);s=s.substring(0,l)}else{a();return}}var c=f.parse(s);s="";if(t){e.postMessage({results:c,workerId:Papa.WORKER_ID,finished:i})}if(i&&b(n.complete))n.complete(c);else if(c&&c.meta.aborted&&b(n.complete))n.complete(c);else if(!i)a()}function p(){if(b(n.error))n.error(u.statusText);else if(t&&n.error){e.postMessage({workerId:Papa.WORKER_ID,error:u.statusText,finished:false})}}function d(e){var t=e.getResponseHeader("Content-Range");return parseInt(t.substr(t.lastIndexOf("/")+1))}if(t){a=function(){c();h()}}else{a=function(){c()}}a()}}function l(n){n=n||{};if(!n.chunkSize)n.chunkSize=1024*1024*10;var r=0;var i="";var s="";var o,u,a;var f=new c(y(n));this.stream=function(u){function l(){if(r<u.size)c()}function c(){var e=Math.min(r+n.chunkSize,u.size);var t=o.readAsText(a.call(u,r,e),n.encoding);r+=n.chunkSize;return t}function h(o){i+=s+o.target.result;s="";var a=r>=u.size;if(!a){var c=i.lastIndexOf("\n");if(c<0)c=i.lastIndexOf("\r");if(c>-1){s=i.substring(c+1);i=i.substring(0,c)}else{l();return}}var h=f.parse(i);i="";if(t){e.postMessage({results:h,workerId:Papa.WORKER_ID,finished:a})}if(a&&b(n.complete))n.complete(undefined,u);else if(h&&h.meta.aborted&&b(n.complete))n.complete(h,u);else if(!a)l()}function p(){if(b(n.error))n.error(o.error,u);else if(t&&n.error){e.postMessage({workerId:Papa.WORKER_ID,error:o.error,file:u,finished:false})}}var a=u.slice||u.webkitSlice||u.mozSlice;o=new FileReader;o.onload=h;o.onerror=p;l()}}function c(e){function s(){if(i&&n){c("Delimiter","UndetectableDelimiter","Unable to auto-detect delimiting character; defaulted to comma");n=false}if(o())u();return a()}function o(){return e.header&&r.length==0}function u(){if(!i)return;for(var e=0;o()&&e<i.data.length;e++)for(var t=0;t<i.data[e].length;t++)r.push(i.data[e][t]);i.data.splice(0,1)}function a(){if(!i||!e.header&&!e.dynamicTyping)return i;for(var t=0;t<i.data.length;t++){var n={};for(var s=0;s<i.data[t].length;s++){if(e.dynamicTyping){var o=i.data[t][s];if(o=="true")i.data[t][s]=true;else if(o=="false")i.data[t][s]=false;else i.data[t][s]=l(o)}if(e.header){if(s>=r.length){if(!n["__parsed_extra"])n["__parsed_extra"]=[];n["__parsed_extra"].push(i.data[t][s])}n[r[s]]=i.data[t][s]}}if(e.header){i.data[t]=n;if(s>r.length)c("FieldMismatch","TooManyFields","Too many fields: expected "+r.length+" fields but parsed "+s,t);else if(s<r.length)c("FieldMismatch","TooFewFields","Too few fields: expected "+r.length+" fields but parsed "+s,t)}}if(e.header&&i.meta);i.meta.fields=r;return i}function f(t){var n=[",","  ","|",";",Papa.RECORD_SEP,Papa.UNIT_SEP];var r,i,s;for(var o=0;o<n.length;o++){var u=n[o];var a=0,f=0;s=undefined;var l=(new h({delimiter:u,preview:10})).parse(t);for(var c=0;c<l.data.length;c++){var p=l.data[c].length;f+=p;if(typeof s==="undefined"){s=p;continue}else if(p>1){a+=Math.abs(p-s);s=p}}f/=l.data.length;if((typeof i==="undefined"||a<i)&&f>1.99){i=a;r=u}}e.delimiter=r;return{successful:!!r,bestDelimiter:r}}function l(e){var n=t.test(e);return n?parseFloat(e):e}function c(e,t,n,r){i.errors.push({type:e,code:t,message:n,row:r})}var t=/^\s*-?(\d*\.?\d+|\d+\.?\d*)(e[-+]?\d+)?\s*$/i;var n;var r=[];var i={data:[],errors:[],meta:{}};e=y(e);this.parse=function(t){n=false;if(!e.delimiter){var r=f(t);if(r.successful)e.delimiter=r.bestDelimiter;else{n=true;e.delimiter=","}i.meta.delimiter=e.delimiter}if(b(e.step)){var u=e.step;e.step=function(e,t){i=e;if(o())s();else u(s(),t)}}i=(new h(e)).parse(t);return s()}}function h(e){function w(){while(l<r.length){if(g)break;if(a>0&&v>=a)break;if(y)return S();if(f=='"')x();else if(c)T();else N();E()}return S()}function E(){l++;f=r[l]}function S(){if(g)F("Abort","ParseAbort","Parsing was aborted by the user's step function");if(c)F("Quotes","MissingQuotes","Unescaped or mismatched quotes");M();if(!b(o))return R()}function x(){if(B()&&!H())c=!c;else{L();if(c&&H())l++;else F("Quotes","UnexpectedQuotes","Unexpected quotes")}}function T(){L()}function N(){if(f==i)A();else if(D()){O();E()}else if(P())O();else if(C())k();else L()}function C(){if(!s)return false;var e=l==0||P(l-1)||D(l-2);return e&&r[l]===s}function k(){while(!D()&&!P()&&l<r.length){E()}}function L(){p[v][m]+=f}function A(){p[v].push("");m=p[v].length-1}function O(){M();h++;p.push([]);v=p.length-1;A()}function M(){_();if(b(o)){if(p[v])o(R(),t);q()}}function _(){if(p[v].length==1&&n.test(p[v][0])){p.splice(v,1);v=p.length-1}}function D(e){if(typeof e!=="number")e=l;return e<r.length-1&&(r[e]=="\r"&&r[e+1]=="\n"||r[e]=="\n"&&r[e+1]=="\r")}function P(e){if(typeof e!=="number")e=l;return r[e]=="\r"||r[e]=="\n"}function H(){return!B()&&l<r.length-1&&r[l+1]=='"'}function B(){return!c&&j(l-1)||j(l+1)}function j(e){if(typeof e!="number")e=l;var t=r[e];return e<=-1||e>=r.length||t==i||t=="\r"||t=="\n"}function F(e,t,n){d.push({type:e,code:t,message:n,line:h,row:v,index:l})}function I(e){r=e;c=false;h=1;l=0;q();p=[[""]];f=r[l]}function q(){p=[];d=[];v=0;m=0}function R(){return{data:p,errors:d,meta:{lines:h,delimiter:i,aborted:g}}}var t=this;var n=/^\s*$/;var r;var i;var s;var o;var u;var a;var f;var l;var c;var h;var p;var d;var v;var m;var g=false;var y=false;e=e||{};i=e.delimiter;s=e.comments;o=e.step;a=e.preview;if(typeof i!=="string"||i.length!=1||Papa.BAD_DELIMITERS.indexOf(i)>-1)i=",";if(s===true)s="#";else if(typeof s!=="string"||s.length!=1||Papa.BAD_DELIMITERS.indexOf(s)>-1||s==i)s=false;this.parse=function(e){if(typeof e!=="string")throw"Input must be a string";I(e);return w()};this.abort=function(){g=true}}function p(){var e="worker"+String(Math.random()).substr(2);document.write('<script id="'+e+'"></script>');return document.getElementById(e).previousSibling.src}function d(){if(!Papa.WORKERS_SUPPORTED)return false;var t=new e.Worker(n);t.onmessage=v;t.id=i++;r[t.id]=t;return t}function v(e){var t=e.data;var n=r[t.workerId];if(t.results&&t.results.data&&b(n.userStep)){for(var i=0;i<t.results.data.length;i++){n.userStep({data:[t.results.data[i]],errors:t.results.errors,meta:t.results.meta})}delete t.results}else if(t.error)n.userError(t.error,t.file);if(t.finished){if(b(r[t.workerId].userComplete))r[t.workerId].userComplete(t.results);r[t.workerId].terminate();delete r[t.workerId]}}function m(t){var n=t.data;if(typeof Papa.WORKER_ID==="undefined"&&n)Papa.WORKER_ID=n.workerId;if(typeof n.input==="string"){e.postMessage({workerId:Papa.WORKER_ID,results:Papa.parse(n.input,n.config),finished:true})}else if(n.input instanceof File){var r=Papa.parse(n.input,n.config);if(r)e.postMessage({workerId:Papa.WORKER_ID,results:r,finished:true})}}function g(e){if(typeof e!=="object")e={};var t=y(e);if(typeof t.delimiter!=="string"||t.delimiter.length!=1||Papa.BAD_DELIMITERS.indexOf(t.delimiter)>-1)t.delimiter=s.delimiter;if(typeof t.header!=="boolean")t.header=s.header;if(typeof t.dynamicTyping!=="boolean")t.dynamicTyping=s.dynamicTyping;if(typeof t.preview!=="number")t.preview=s.preview;if(typeof t.step!=="function")t.step=s.step;if(typeof t.complete!=="function")t.complete=s.complete;if(typeof t.encoding!=="string")t.encoding=s.encoding;if(typeof t.worker!=="boolean")t.worker=s.worker;if(typeof t.download!=="boolean")t.download=s.download;return t}function y(e){if(typeof e!=="object")return e;var t=e instanceof Array?[]:{};for(var n in e)t[n]=y(e[n]);return t}function b(e){return typeof e==="function"}var t=!e.document,n;var r={},i=0;var s={delimiter:"",header:false,dynamicTyping:false,preview:0,step:undefined,encoding:"",worker:false,comments:false,complete:undefined,download:false};e.Papa={};e.Papa.parse=u;e.Papa.unparse=a;e.Papa.RECORD_SEP=String.fromCharCode(30);e.Papa.UNIT_SEP=String.fromCharCode(31);e.Papa.BYTE_ORDER_MARK="﻿";e.Papa.BAD_DELIMITERS=["\r","\n",'"',e.Papa.BYTE_ORDER_MARK];e.Papa.WORKERS_SUPPORTED=!!e.Worker;e.Papa.Parser=h;e.Papa.ParserHandle=c;e.Papa.NetworkStreamer=f;e.Papa.FileStreamer=l;if(e.jQuery){var o=e.jQuery;o.fn.parse=function(t){function i(){if(r.length==0){if(b(t.complete))t.complete();return}var e=r[0];if(b(t.before)){var n=t.before(e.file,e.inputElem);if(typeof n==="object"){if(n.action=="abort"){s("AbortError",e.file,e.inputElem,n.reason);return}else if(n.action=="skip"){u();return}else if(typeof n.config==="object")e.instanceConfig=o.extend(e.instanceConfig,n.config)}else if(n=="skip"){u();return}}var i=e.instanceConfig.complete;e.instanceConfig.complete=function(t){if(b(i))i(t,e.file,e.inputElem);u()};Papa.parse(e.file,e.instanceConfig)}function s(e,n,r,i){if(b(t.error))t.error({name:e},n,r,i)}function u(){r.splice(0,1);i()}var n=t.config||{};var r=[];this.each(function(t){var i=o(this).prop("tagName").toUpperCase()=="INPUT"&&o(this).attr("type").toLowerCase()=="file"&&e.FileReader;if(!i||!this.files||this.files.length==0)return true;for(var s=0;s<this.files.length;s++){r.push({file:this.files[s],inputElem:this,instanceConfig:o.extend({},n)})}});i();return this}}if(t)e.onmessage=m;else if(Papa.WORKERS_SUPPORTED)n=p()})(this);

});

require.register("parse-require", function(exports, require, module) {
module.exports = function() {
  return {
  url: 'https://api.parse.com/1/classes/',
  batchURL: 'https://api.parse.com/1/batch',
  _current_user: (localStorage.currentUser) ? JSON.parse(localStorage.currentUser) : {},
  _company: (localStorage.currentUser) ? JSON.parse(localStorage.currentUser).user_company : {},
  _user_company: (localStorage.currentUser) ? JSON.parse(localStorage.currentUser).user_company : {},
  headers: {
    'X-Parse-Application-Id'  : 'UNzLkHlTrY1qSkj2QoNxbdzD3t6WHicwee5zVfhO',
    'X-Parse-REST-API-Key'    : 'Vuu3OlmrNRPwUZUHX5i42reIh5EVsCIvMY8EX0y4',
    'Content-Type' : 'application/json'
  },

  _pointer: function(className, objectId) {
    return { __type:'Pointer', 'className': className, 'objectId': objectId}
  },
  _user: { __type:'Pointer', className: '_User', 
           objectId:  (localStorage.currentUser) ? JSON.parse(localStorage.currentUser).objectId : ""},

  /*  
   *  Add user and user_company fields from all requests
   */

  _currentUserify: function(qry) {
    where = (qry.where) ? JSON.parse(qry.where) : {}
    where.user = this._user
    where.user_company = this._user_company
    /*
    if(typeof(where.archived) == "undefined") 
        where.archived = {$in:[null, false]}
    */
    //qry.limit = (typeof(qry.limit) == "undefined") ? 1000 : qry.limit
    qry.order = (typeof(qry.order) == "undefined") ? '-createdAt' : qry.order
    qry.where = JSON.stringify(where)
    return qry
  },

  get: function(className, qry) {
    var qry = this._currentUserify(qry);
    console.debug(qry)
    //console.debug('THE QUERY')
    //console.debug(qry)
    var _this = this;

    request = $.ajax({
      url: _this.url+className,
      headers: appConfig.parseHeaders,
      type:'GET',
      data: qry,
    });
    return request
  },

  _get: function(className, qry) {
    var _this = this;

    request = $.ajax({
      url: _this.url+className,
      headers: appConfig.parseHeaders,
      type:'GET',
      data: qry,
    });
    return request
  },

  update: function() {
    var qry = this._currentUserify(qry);
    var _this = this;
    request = $.ajax({
      url: _this.url+className,
      headers: appConfig.parseHeaders,
      type:'PUT',
      data: qry,
    });
    return request
  },

  put: function(_object, qry) {
    var qry = this._currentUserify(qry);
    var _this = this;
    request = $.ajax({
      url: _this.url+_object,
      headers: appConfig.parseHeaders,
      type:'PUT',
      data: JSON.stringify(qry),
    });
    return request
  },

  create: function(qry) {
    var qry = this._currentUserify(qry);
    var _this = this;
    request = $.ajax({
      url: _this.url+className,
      headers: appConfig.parseHeaders,
      type:'PUT',
      data: qry,
    });
    return request
  },

  delete: function() {

  },

  bulkDownload: function() {
    // if more than 10 000 get date
  },

  batchCreate: function(className, objArray, body) {
    // map
    method = "POST"
    var _this = this;
    request = $.ajax({
      url: _this.batchURL,
      headers: appConfig.parseHeaders,
      type:'POST',
      data: qry,
    });
    return request
  },

  batchUpdate: function(className, objArray, body) {
    qry = {'requests':[]}
    qry.requests = _.map(objArray, function(obj){
      return {
        method: "PUT",
        path: "/1/classes/"+className+"/"+obj,
        body: body
      }
    }) 

    var _this = this;
    request = $.ajax({
      url: _this.batchURL,
      headers: appConfig.parseHeaders,
      type:'POST',
      data: JSON.stringify(qry),
    });
    return request
  },

  increment: function() {

  }
  }
}

});

;require.register("parse", function(exports, require, module) {
// Parse Stuff

var Parse = {
  url: 'https://api.parse.com/1/classes/',
  batchURL: 'https://api.parse.com/1/batch',
  _current_user: (localStorage.currentUser) ? JSON.parse(localStorage.currentUser) : {},
  _company: (localStorage.currentUser) ? JSON.parse(localStorage.currentUser).user_company : {},
  _user_company: (localStorage.currentUser) ? JSON.parse(localStorage.currentUser).user_company : {},
  headers: {
    'X-Parse-Application-Id'  : 'N85QOkteEEQkuZVJKAvt8MVes0sjG6qNpEGqQFVJ', 
    'X-Parse-REST-API-Key'    : 'VN6EwVyBZwO1uphsBPsau8t7JQRp00UM3KYsiiQb',
    'Content-Type' : 'application/json'
  },

  _pointer: function(className, objectId) {
    return { __type:'Pointer', 'className': className, 'objectId': objectId}
  },
  _user: { __type:'Pointer', className: '_User', 
           objectId:  (localStorage.currentUser) ? JSON.parse(localStorage.currentUser).objectId : ""},

  /*  
   *  Add user and user_company fields from all requests
   */

  _currentUserify: function(qry) {
    where = (qry.where) ? JSON.parse(qry.where) : {}
    where.user = this._user
    where.user_company = this._user_company
    /*
    if(typeof(where.archived) == "undefined") 
        where.archived = {$in:[null, false]}
    */
    //qry.limit = (typeof(qry.limit) == "undefined") ? 1000 : qry.limit
    qry.order = (typeof(qry.order) == "undefined") ? '-createdAt' : qry.order
    qry.where = JSON.stringify(where)
    return qry
  },

  get: function(className, qry) {
    var qry = this._currentUserify(qry);
    console.debug(qry)
    //console.debug('THE QUERY')
    //console.debug(qry)
    var _this = this;

    request = $.ajax({
      url: _this.url+className,
      headers: appConfig.parseHeaders,
      type:'GET',
      data: qry,
    });
    return request
  },

  getObject: function(className, objectId) {
    var _this = this;

    request = $.ajax({
      url: _this.url+className+"/"+objectId,
      headers: appConfig.parseHeaders,
      type:'GET',
    });
    return request

  },

  _get: function(className, qry) {
    var _this = this;

    request = $.ajax({
      url: _this.url+className,
      headers: appConfig.parseHeaders,
      type:'GET',
      data: qry,
    });
    return request
  },

  update: function() {
    var qry = this._currentUserify(qry);
    var _this = this;
    request = $.ajax({
      url: _this.url+className,
      headers: appConfig.parseHeaders,
      type:'PUT',
      data: qry,
    });
    return request
  },

  put: function(_object, qry) {
    var qry = this._currentUserify(qry);
    var _this = this;
    request = $.ajax({
      url: _this.url+_object,
      headers: appConfig.parseHeaders,
      type:'PUT',
      data: JSON.stringify(qry),
    });
    return request
  },

  create: function(className, qry) {
    var qry = this._currentUserify(qry);
    var _this = this;
    request = $.ajax({
      url: _this.url+className,
      headers: appConfig.parseHeaders,
      type:'POST',
      data: qry,
    });
    return request
  },

  delete: function() {

  },

  bulkDownload: function() {
    // if more than 10 000 get date
  },

  batchCreate: function(className, objArray, body) {
    // map
    method = "POST"
    var _this = this;
    request = $.ajax({
      url: _this.batchURL,
      headers: appConfig.parseHeaders,
      type:'POST',
      data: qry,
    });
    return request
  },

  batchUpdate: function(className, objArray, body) {
    qry = {'requests':[]}
    qry.requests = _.map(objArray, function(obj){
      return {
        method: "PUT",
        path: "/1/classes/"+className+"/"+obj,
        body: body
      }
    }) 

    var _this = this;
    request = $.ajax({
      url: _this.batchURL,
      headers: appConfig.parseHeaders,
      type:'POST',
      data: JSON.stringify(qry),
    });
    return request
  },

  increment: function() {

  }
}


var KeyboardShortcuts = {
  initialize: function() {

  },
  _initialize: function() {
    /* Keyboard Shortcuts */
    Mousetrap.reset()
    //Mousetrap.unbind(['j','k','o'])
    thiss = this;

    /* Prospect Table Shortcuts */
    Mousetrap.bind('j', function() { 
      keyboard = thiss.state.keyboardActiveProspect
      if(keyboard != thiss.state.prospectsPerPage+1)
        thiss.adjustHeight('j')
        thiss.setState({keyboardActiveProspect: keyboard+1})
    });

    Mousetrap.bind('k', function() { 
      keyboard = thiss.state.keyboardActiveProspect
      if(keyboard != 1)
        thiss.adjustHeight('k')
        thiss.setState({keyboardActiveProspect: keyboard-1})
    });

    Mousetrap.bind('s', function() { 
      console.log('open current prospect')
      console.log($($('.keySelect').find('a.linkedin_link')[0]).attr('href'))
      link = $($('.keySelect').find('a.similar_link')[0]).attr('href')
      /*
      window.open(link, '_blank')
      console.log('new')
      */
      //popupWindow.blur();
      //window.focus();
      // keyboard = thiss.state.keyboardActiveProspect
      
      var a = document.createElement("a");
      a.href = link
      var evt = document.createEvent("MouseEvents");
      //the tenth parameter of initMouseEvent sets ctrl key
      // For Mac This Works Check For - Windows
      evt.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0,
                                  false, false, false, true, 0, null);
      a.dispatchEvent(evt);
    });

    Mousetrap.bind('o', function() { 
      console.log('open current prospect')
      console.log($($('.keySelect').find('a.linkedin_link')[0]).attr('href'))
      link = $($('.keySelect').find('a.linkedin_link')[0]).attr('href')
      /*
      window.open(link, '_blank')
      console.log('new')
      */
      //popupWindow.blur();
      //window.focus();
      // keyboard = thiss.state.keyboardActiveProspect
      
      var a = document.createElement("a");
      a.href = link
      var evt = document.createEvent("MouseEvents");
      //the tenth parameter of initMouseEvent sets ctrl key
      // For Mac This Works Check For - Windows
      evt.initMouseEvent("click", true, true, window, 0, 0, 0, 0, 0,
                                  false, false, false, true, 0, null);
      a.dispatchEvent(evt);
    });

    /* List Modification Shortcuts */
    Mousetrap.bind('tab+r', function(){
      //console.log('reload')
      $('#renameListBtn').click()
    })

    Mousetrap.bind('tab+d', function(){
      //console.log('reload')
      $('#deleteListModal').click()
    })

    Mousetrap.bind('tab+s', function(){
      //console.log('reload')
      //$('#downloadProspects').click()
      thiss.downloadFile()
    })

    Mousetrap.bind('shift+l', function(){
      //console.log('reload')
      //$('#downloadProspects').click()
      //thiss.downloadFile()
      $('.new-list-btn').click()
    })

    Mousetrap.bind('e', function(){
      console.log('reload')
      //$('#downloadProspects').click()
      thiss.removeSelectedProspects()
    })

    Mousetrap.bind('c', function() { 
      console.log('copy')
      $('#copyToList').click()
    });

    Mousetrap.bind('m', function() { 
      console.log('copy')
      $('#moveToList').click()
    });

    //Mousetrap.bind('e', function() { console.log('e'); });
    Mousetrap.bind('right', function() { console.log('right'); });
    Mousetrap.bind('left', function() { console.log('left'); });


  },
  adjustHeight: function(whichOne) {
    prospectWindowTop = $('#prospectDetailButtons').position().top
    prospectWindowTop = prospectWindowTop + $('#prospectDetailButtons').height()
    prospectWindowBottom = $('#autoscroll').position().top + $('#autoscroll').height()

    if(whichOne == 'j')
      activeProspect = this.state.keyboardActiveProspect +1 
    else
      activeProspect = this.state.keyboardActiveProspect -1 

    activeTop = $($('.prospects-tr')[activeProspect]).position().top
    selectedHeight = $($('.prospects-tr')[activeProspect]).height()
    activeBottom = $($('.prospects-tr')[activeProspect]).position().top+selectedHeight

    console.log(prospectWindowTop, prospectWindowBottom)
    console.log(activeTop, activeBottom)

    scrollTop = document.getElementById('autoscroll').scrollTop
    if(activeBottom > prospectWindowBottom)
      document.getElementById('autoscroll').scrollTop = scrollTop + activeBottom - prospectWindowBottom

    if(activeTop < 0)
      document.getElementById('autoscroll').scrollTop = scrollTop + activeTop - 37
    else if(activeTop == $($('.prospects-tr')[0]).position().top)
      document.getElementById('autoscroll').scrollTop = 0

  }
}

function particles() {
particlesJS('particles-js', {
    particles: {
      color: '#fff',
      shape: 'circle',
      opacity: 1,
      size: 2.5,
      size_random: true,
      nb: 100,
      line_linked: {
        enable_auto: true,
        distance: 250,
        color: '#fff',
        opacity: 0.5,
        width: 1,
        condensed_mode: {
          enable: false,
          rotateX: 600,
          rotateY: 600
        }
      },
      anim: {
        enable: true,
        speed: 2.5
      }
    },
    interactivity: {
      enable: true,
      mouse: {
        distance: 250
      },
      detect_on: 'canvas',
      mode: 'grab',
      line_linked: {
        opacity: 0.5
      },
      events: {
        onclick: {
          push_particles: {
            enable: true,
            nb: 4
          }
        }
      }
    },
    retina_detect: true
});

$('canvas').css({
  'width': '100%',
  'height': '376px',
  'background-color': 'rgba(0,0,0,0)',
  'top': '122px',
  'position': 'absolute',
})
}

function init_parse() {
  return {
    url: 'https://api.parse.com/1/classes/',
    batchURL: 'https://api.parse.com/1/batch',
    _current_user: (localStorage.currentUser) ? JSON.parse(localStorage.currentUser) : {},
    _company: (localStorage.currentUser) ? JSON.parse(localStorage.currentUser).user_company : {},
    _user_company: (localStorage.currentUser) ? JSON.parse(localStorage.currentUser).user_company : {},
    headers: {
      'X-Parse-Application-Id'  : 'N85QOkteEEQkuZVJKAvt8MVes0sjG6qNpEGqQFVJ', 
      'X-Parse-REST-API-Key'    : 'VN6EwVyBZwO1uphsBPsau8t7JQRp00UM3KYsiiQb',
      'Content-Type' : 'application/json'
    },

    _pointer: function(className, objectId) {
      return { __type:'Pointer', 'className': className, 'objectId': objectId}
    },
    _user: { __type:'Pointer', className: '_User', 
             objectId:  (localStorage.currentUser) ? JSON.parse(localStorage.currentUser).objectId : ""},

    /*  
     *  Add user and user_company fields from all requests
     */

    _currentUserify: function(qry) {
      where = (qry.where) ? JSON.parse(qry.where) : {}
      where.user = this._user
      where.user_company = this._user_company
      /*
      if(typeof(where.archived) == "undefined") 
          where.archived = {$in:[null, false]}
      */
      //qry.limit = (typeof(qry.limit) == "undefined") ? 1000 : qry.limit
      qry.order = (typeof(qry.order) == "undefined") ? '-createdAt' : qry.order
      qry.where = JSON.stringify(where)
      return qry
    },

    get: function(className, qry) {
      var qry = this._currentUserify(qry);
      console.debug(qry)
      //console.debug('THE QUERY')
      //console.debug(qry)
      var _this = this;

      request = $.ajax({
        url: _this.url+className,
        headers: appConfig.parseHeaders,
        type:'GET',
        data: qry,
      });
      return request
    },

    _get: function(className, qry) {
      var _this = this;

      request = $.ajax({
        url: _this.url+className,
        headers: appConfig.parseHeaders,
        type:'GET',
        data: qry,
      });
      return request
    },

    update: function() {
      var qry = this._currentUserify(qry);
      var _this = this;
      request = $.ajax({
        url: _this.url+className,
        headers: appConfig.parseHeaders,
        type:'PUT',
        data: qry,
      });
      return request
    },

    put: function(_object, qry) {
      var qry = this._currentUserify(qry);
      var _this = this;
      request = $.ajax({
        url: _this.url+_object,
        headers: appConfig.parseHeaders,
        type:'PUT',
        data: JSON.stringify(qry),
      });
      return request
    },

    create: function(qry) {
      var qry = this._currentUserify(qry);
      var _this = this;
      request = $.ajax({
        url: _this.url+className,
        headers: appConfig.parseHeaders,
        type:'PUT',
        data: qry,
      });
      return request
    },

    delete: function() {

    },

    bulkDownload: function() {
      // if more than 10 000 get date
    },

    batchCreate: function(className, objArray, body) {
      // map
      method = "POST"
      var _this = this;
      request = $.ajax({
        url: _this.batchURL,
        headers: appConfig.parseHeaders,
        type:'POST',
        data: qry,
      });
      return request
    },

    batchUpdate: function(className, objArray, body) {
      qry = {'requests':[]}
      qry.requests = _.map(objArray, function(obj){
        return {
          method: "PUT",
          path: "/1/classes/"+className+"/"+obj,
          body: body
        }
      }) 

      var _this = this;
      request = $.ajax({
        url: _this.batchURL,
        headers: appConfig.parseHeaders,
        type:'POST',
        data: JSON.stringify(qry),
      });
      return request
    },

    increment: function() {

    }
  }
}

});

;require.register("particles", function(exports, require, module) {
/* -----------------------------------------------
/* Configuration parameters could be modified in future releases.
/* It is highly recommended to host the particles.js file on your own server.
/* ----------------------------------------------- */

/* -----------------------------------------------
/* Author : Vincent Garreau  - vincentgarreau.com
/* MIT license: http://opensource.org/licenses/MIT
/* GitHub : https://github.com/VincentGarreau/particles.js
/* How to use? : Check the GitHub README
/* v1.0.3
/* ----------------------------------------------- */

function launchParticlesJS(tag_id, params){

  var canvas_el = document.querySelector('#'+tag_id+' > canvas');

  /* particles.js variables with default values */
  pJS = {
    canvas: {
      el: canvas_el,
      w: canvas_el.offsetWidth,
      h: canvas_el.offsetHeight
    },
    particles: {
      color: '#fff',
      shape: 'circle',
      opacity: 1,
      size: 2.5,
      size_random: true,
      nb: 200,
      line_linked: {
        enable_auto: true,
        distance: 100,
        color: '#fff',
        opacity: 1,
        width: 1,
        condensed_mode: {
          enable: true,
          rotateX: 65000,
          rotateY: 65000
        }
      },
      anim: {
        enable: true,
          speed: 1
      },
      array: []
    },
    interactivity: {
      enable: true,
      mouse: {
        distance: 100
      },
      detect_on: 'canvas',
      mode: 'grab',
      line_linked: {
        opacity: 1
      },
      events: {
        onclick: {
          enable: true,
          mode: 'push',
          nb: 4
        }
      }
    },
    retina_detect: false,
    fn: {
      vendors:{
        interactivity: {}
      }
    }
  };

  /* params settings */
  if(params){
    if(params.particles){
      var paramsForParticles = params.particles;
      if(paramsForParticles.color) pJS.particles.color = paramsForParticles.color;
      if(paramsForParticles.shape) pJS.particles.shape = paramsForParticles.shape;
      if(paramsForParticles.opacity) pJS.particles.opacity = paramsForParticles.opacity;
      if(paramsForParticles.size) pJS.particles.size = paramsForParticles.size;
      if(paramsForParticles.size_random == false) pJS.particles.size_random = paramsForParticles.size_random;
      if(paramsForParticles.nb) pJS.particles.nb = paramsForParticles.nb;
      if(paramsForParticles.line_linked){
        var paramsForLineLinked = paramsForParticles.line_linked;
        if(paramsForLineLinked.enable_auto == false) pJS.particles.line_linked.enable_auto = paramsForLineLinked.enable_auto;
        if(paramsForLineLinked.distance) pJS.particles.line_linked.distance = paramsForLineLinked.distance;
        if(paramsForLineLinked.color) pJS.particles.line_linked.color = paramsForLineLinked.color;
        if(paramsForLineLinked.opacity) pJS.particles.line_linked.opacity = paramsForLineLinked.opacity;
        if(paramsForLineLinked.width) pJS.particles.line_linked.width = paramsForLineLinked.width;
        if(paramsForLineLinked.condensed_mode){
          var paramsForCondensedMode = paramsForLineLinked.condensed_mode;
          if(paramsForCondensedMode.enable == false) pJS.particles.line_linked.condensed_mode.enable = paramsForCondensedMode.enable;
          if(paramsForCondensedMode.rotateX) pJS.particles.line_linked.condensed_mode.rotateX = paramsForCondensedMode.rotateX;
          if(paramsForCondensedMode.rotateY) pJS.particles.line_linked.condensed_mode.rotateY = paramsForCondensedMode.rotateY;
        }
      }
      if(paramsForParticles.anim){
        var paramsForAnim = paramsForParticles.anim;
        if(paramsForAnim.enable == false) pJS.particles.anim.enable = paramsForAnim.enable;
        if(paramsForAnim.speed) pJS.particles.anim.speed = paramsForAnim.speed;
      }
    }
    if(params.interactivity){
      var paramsForInteractivity = params.interactivity;
      if(paramsForInteractivity.enable == false) pJS.interactivity.enable = paramsForInteractivity.enable;
      if(paramsForInteractivity.mouse){
        if(paramsForInteractivity.mouse.distance) pJS.interactivity.mouse.distance = paramsForInteractivity.mouse.distance;
      }
      if(paramsForInteractivity.detect_on) pJS.interactivity.detect_on = paramsForInteractivity.detect_on;
      if(paramsForInteractivity.mode) pJS.interactivity.mode = paramsForInteractivity.mode;
      if(paramsForInteractivity.line_linked){
        if(paramsForInteractivity.line_linked.opacity) pJS.interactivity.line_linked.opacity = paramsForInteractivity.line_linked.opacity;
      }
      if(paramsForInteractivity.events){
        var paramsForEvents = paramsForInteractivity.events;
        if(paramsForEvents.onclick){
          var paramsForOnclick = paramsForEvents.onclick;
          if(paramsForOnclick.enable == false) pJS.interactivity.events.onclick.enable = false;
          if(paramsForOnclick.mode != 'push') pJS.interactivity.events.onclick.mode = paramsForOnclick.mode;
          if(paramsForOnclick.nb) pJS.interactivity.events.onclick.nb = paramsForOnclick.nb;
        }
      }
    }
    pJS.retina_detect = params.retina_detect;
  }

  /* convert hex colors to rgb */
  pJS.particles.color_rgb = hexToRgb(pJS.particles.color);
  pJS.particles.line_linked.color_rgb_line = hexToRgb(pJS.particles.line_linked.color);

  /* detect retina */
  if(pJS.retina_detect && window.devicePixelRatio > 1){
    pJS.retina = true;
  
    pJS.canvas.pxratio = window.devicePixelRatio
    pJS.canvas.w = pJS.canvas.el.offsetWidth * pJS.canvas.pxratio;
    pJS.canvas.h = pJS.canvas.el.offsetHeight * pJS.canvas.pxratio;
    pJS.particles.anim.speed = pJS.particles.anim.speed * pJS.canvas.pxratio;
    pJS.particles.line_linked.distance = pJS.particles.line_linked.distance * pJS.canvas.pxratio;
    pJS.particles.line_linked.width = pJS.particles.line_linked.width * pJS.canvas.pxratio;
    pJS.interactivity.mouse.distance = pJS.interactivity.mouse.distance * pJS.canvas.pxratio;
  }


  /* ---------- CANVAS functions ------------ */

  pJS.fn.canvasInit = function(){
    pJS.canvas.ctx = pJS.canvas.el.getContext('2d');
  };

  pJS.fn.canvasSize = function(){
    pJS.canvas.el.width = pJS.canvas.w;
    pJS.canvas.el.height = pJS.canvas.h;

    window.onresize = function(){
      if(pJS){
        pJS.canvas.w = pJS.canvas.el.offsetWidth;
        pJS.canvas.h = pJS.canvas.el.offsetHeight;

        /* resize canvas */
        if(pJS.retina){
          pJS.canvas.w *= pJS.canvas.pxratio;
          pJS.canvas.h *= pJS.canvas.pxratio;
        }

        pJS.canvas.el.width = pJS.canvas.w;
        pJS.canvas.el.height = pJS.canvas.h;

        /* repaint canvas */
        pJS.fn.canvasPaint();
        if(!pJS.particles.anim.enable){
          pJS.fn.particlesRemove();
          pJS.fn.canvasRemove();
          launchParticles();
        }
      }
    }
  };

  pJS.fn.canvasPaint = function(){
    pJS.canvas.ctx.fillRect(0, 0, pJS.canvas.w, pJS.canvas.h);
  };

  pJS.fn.canvasRemove = function(){
    pJS.canvas.ctx.clearRect(0, 0, pJS.canvas.w, pJS.canvas.h);
  }


  /* --------- PARTICLES functions ----------- */

  pJS.fn.particle = function(color, opacity, position){

    /* position */
    this.x = position ? position.x : Math.random() * pJS.canvas.w;
    this.y = position ? position.y : Math.random() * pJS.canvas.h;

    /* size */
    this.radius = (pJS.particles.size_random ? Math.random() : 1) * pJS.particles.size;
    if (pJS.retina) this.radius *= pJS.canvas.pxratio;

    /* color */
    this.color = color;

    /* opacity */
    this.opacity = opacity;

    /* animation - velocity for speed */
    this.vx = -.5 + Math.random();
    this.vy = -.5 + Math.random();

    /* draw function */
    this.draw = function(){
      pJS.canvas.ctx.fillStyle = 'rgba('+this.color.r+','+this.color.g+','+this.color.b+','+this.opacity+')';
      pJS.canvas.ctx.beginPath();

      switch(pJS.particles.shape){
        case 'circle':
          pJS.canvas.ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2, false);
        break;

        case 'edge':
          pJS.canvas.ctx.rect(this.x, this.y, this.radius*2, this.radius*2);
        break;

        case 'triangle':
          pJS.canvas.ctx.moveTo(this.x,this.y-this.radius);
          pJS.canvas.ctx.lineTo(this.x+this.radius,this.y+this.radius);
          pJS.canvas.ctx.lineTo(this.x-this.radius,this.y+this.radius);
          pJS.canvas.ctx.closePath();
        break;
      }

      pJS.canvas.ctx.fill();
    }

  };

  pJS.fn.particlesCreate = function(){
    for(var i = 0; i < pJS.particles.nb; i++) {
      pJS.particles.array.push(new pJS.fn.particle(pJS.particles.color_rgb, pJS.particles.opacity));
    }
  };

  pJS.fn.particlesAnimate = function(){
    for(var i = 0; i < pJS.particles.array.length; i++){
      /* the particle */
      var p = pJS.particles.array[i];

      /* move the particle */
      p.x += p.vx * (pJS.particles.anim.speed/2);
      p.y += p.vy * (pJS.particles.anim.speed/2);

      /* change particle position if it is out of canvas */
      if(p.x - p.radius > pJS.canvas.w) p.x = p.radius;
      else if(p.x + p.radius < 0) p.x = pJS.canvas.w + p.radius;
      if(p.y - p.radius > pJS.canvas.h) p.y = p.radius;
      else if(p.y + p.radius < 0) p.y = pJS.canvas.h + p.radius;

      /* Check distance between each particle and mouse position */
      for(var j = i + 1; j < pJS.particles.array.length; j++){
        var p2 = pJS.particles.array[j];

        /* link particles if enable */
        if(pJS.particles.line_linked.enable_auto){
          pJS.fn.vendors.distanceParticles(p,p2);
        }

        /* set interactivity if enable */
        if(pJS.interactivity.enable){

          /* interactivity mode */
          switch(pJS.interactivity.mode){
            case 'grab':
              pJS.fn.vendors.interactivity.grabParticles(p,p2);
            break;
          }

        }


      }
    }
  };

  pJS.fn.particlesDraw = function(){
    /* clear canvas */
    pJS.canvas.ctx.clearRect(0, 0, pJS.canvas.w, pJS.canvas.h);

    /* move particles */
    pJS.fn.particlesAnimate();

    /* draw each particle */
    for(var i = 0; i < pJS.particles.array.length; i++){
      var p = pJS.particles.array[i];
      p.draw('rgba('+p.color.r+','+p.color.g+','+p.color.b+','+p.opacity+')');
    }

  };

  pJS.fn.particlesRemove = function(){
    pJS.particles.array = [];
  };


  /* ---------- VENDORS functions ------------ */

  pJS.fn.vendors.distanceParticles = function(p1, p2){

    var dx = p1.x - p2.x,
      dy = p1.y - p2.y,
      dist = Math.sqrt(dx*dx + dy*dy);

    /* Check distance between particle and mouse mos */
    if(dist <= pJS.particles.line_linked.distance) {

      /* draw the line */
      var color_line = pJS.particles.line_linked.color_rgb_line;
      pJS.canvas.ctx.beginPath();
      pJS.canvas.ctx.strokeStyle = 'rgba('+color_line.r+','+color_line.g+','+color_line.b+','+ (pJS.particles.line_linked.opacity-dist/pJS.particles.line_linked.distance) +')';
      pJS.canvas.ctx.moveTo(p1.x, p1.y);
      pJS.canvas.ctx.lineTo(p2.x, p2.y);
      pJS.canvas.ctx.lineWidth = pJS.particles.line_linked.width;
      pJS.canvas.ctx.stroke();
      pJS.canvas.ctx.closePath();

      /* condensed particles */
      if(pJS.particles.line_linked.condensed_mode.enable){
        var dx = p1.x - p2.x,
            dy = p1.y - p2.y,
            ax = dx/(pJS.particles.line_linked.condensed_mode.rotateX*1000),
            ay = dy/(pJS.particles.line_linked.condensed_mode.rotateY*1000);
        p2.vx += ax;
        p2.vy += ay;
      }

    }
  };

  pJS.fn.vendors.interactivity.listeners = function(){

    /* init el */
    if(pJS.interactivity.detect_on == 'window'){
      var detect_el = window;
    }else{
      var detect_el = pJS.canvas.el;
    }

    /* el on mousemove */
    detect_el.onmousemove = function(e){

      if(detect_el == window){
        var pos_x = e.clientX,
            pos_y = e.clientY;
      }
      else{
        var pos_x = e.offsetX||e.clientX,
            pos_y = e.offsetY||e.clientY;
      }

      if(pJS){

        pJS.interactivity.mouse.pos_x = pos_x;
        pJS.interactivity.mouse.pos_y = pos_y;

        if(pJS.retina){
          pJS.interactivity.mouse.pos_x *= pJS.canvas.pxratio;
          pJS.interactivity.mouse.pos_y *= pJS.canvas.pxratio;
        }

        pJS.interactivity.status = 'mousemove';
      }

    };

    /* el on onmouseleave */
    detect_el.onmouseleave = function(e){

      if(pJS){
        pJS.interactivity.mouse.pos_x = 0;
        pJS.interactivity.mouse.pos_y = 0;
        pJS.interactivity.status = 'mouseleave';
      }

    };

    /* el on onclick */
    if(pJS.interactivity.events.onclick.enable){
      switch(pJS.interactivity.events.onclick.mode){
        case 'push':
          detect_el.onclick = function(e){
            if(pJS){
              for(var i = 0; i < pJS.interactivity.events.onclick.nb; i++){
                pJS.particles.array.push(
                  new pJS.fn.particle(
                    pJS.particles.color_rgb,
                    pJS.particles.opacity,
                    {
                      'x': pJS.interactivity.mouse.pos_x,
                      'y': pJS.interactivity.mouse.pos_y
                    }
                  )
                )
              }
            }
          }
        break;

        case 'remove':
          detect_el.onclick = function(e){
            pJS.particles.array.splice(0, pJS.interactivity.events.onclick.nb);
          }
        break;
      }
    }
  };


  pJS.fn.vendors.interactivity.grabParticles = function(p1, p2){
    var dx = p1.x - p2.x,
        dy = p1.y - p2.y,
        dist = Math.sqrt(dx*dx + dy*dy);

    var dx_mouse = p1.x - pJS.interactivity.mouse.pos_x,
        dy_mouse = p1.y - pJS.interactivity.mouse.pos_y,
        dist_mouse = Math.sqrt(dx_mouse*dx_mouse + dy_mouse*dy_mouse);

    /* Check distance between 2 particles + Check distance between 1 particle and mouse position */
    if(dist <= pJS.particles.line_linked.distance && dist_mouse <= pJS.interactivity.mouse.distance && pJS.interactivity.status == 'mousemove'){
      /* Draw the line */
      var color_line = pJS.particles.line_linked.color_rgb_line;
      pJS.canvas.ctx.beginPath();
      pJS.canvas.ctx.strokeStyle = 'rgba('+color_line.r+','+color_line.g+','+color_line.b+','+ (pJS.interactivity.line_linked.opacity-dist_mouse/pJS.interactivity.mouse.distance) +')';
      pJS.canvas.ctx.moveTo(p1.x, p1.y);
      pJS.canvas.ctx.lineTo(pJS.interactivity.mouse.pos_x, pJS.interactivity.mouse.pos_y);
      pJS.canvas.ctx.lineWidth = pJS.particles.line_linked.width;
      pJS.canvas.ctx.stroke();
      pJS.canvas.ctx.closePath();
    }
  };

  pJS.fn.vendors.destroy = function(){
    cancelAnimationFrame(pJS.fn.requestAnimFrame);
    canvas_el.remove();
    delete pJS;
  };


  /* --------- LAUNCH ----------- */

  function launchParticles(){
    pJS.fn.canvasInit();
    pJS.fn.canvasSize();
    pJS.fn.canvasPaint();
    pJS.fn.particlesCreate();
    pJS.fn.particlesDraw();
  };


  function launchAnimation(){
    pJS.fn.particlesDraw();
    pJS.fn.requestAnimFrame = requestAnimFrame(launchAnimation);
  };


  launchParticles();

  if(pJS.particles.anim.enable){
    launchAnimation();
  }

  if(pJS.interactivity.enable){
    pJS.fn.vendors.interactivity.listeners();
  }


};

/* --- VENDORS --- */

window.requestAnimFrame = (function(){
  return  window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame    ||
    window.oRequestAnimationFrame      ||
    window.msRequestAnimationFrame     ||
    function(callback){
      window.setTimeout(callback, 1000 / 60);
    };
})();

window.cancelRequestAnimFrame = ( function() {
  return window.cancelAnimationFrame         ||
    window.webkitCancelRequestAnimationFrame ||
    window.mozCancelRequestAnimationFrame    ||
    window.oCancelRequestAnimationFrame      ||
    window.msCancelRequestAnimationFrame     ||
    clearTimeout
} )();

function hexToRgb(hex){
  // By Tim Down - http://stackoverflow.com/a/5624139/3493650
  // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
  var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, function(m, r, g, b) {
     return r + r + g + g + b + b;
  });
  var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
  } : null;
};


/* --- LAUNCH --- */

window.particlesJS = function(tag_id, params){

  /* no string id? so it's object params, and set the id with default id */
  if(typeof(tag_id) != 'string'){
    params = tag_id;
    tag_id = 'particles-js';
  }

  /* no id? set the id to default id */
  if(!tag_id){
    tag_id = 'particles-js';
  }

  /* create canvas element */
  var canvas_el = document.createElement('canvas');

  /* set size canvas */
  canvas_el.style.width = "100%";
  canvas_el.style.height = "100%";

  /* append canvas */
  var canvas = document.getElementById(tag_id).appendChild(canvas_el);

  /* launch particle.js */
  if(canvas != null){
    launchParticlesJS(tag_id, params);
  }

};
});

require.register("paths", function(exports, require, module) {
(function(){var e=function(){var e,t,n,r,i,s,o,u,a,f,l;return a=function(e){return e.reduce(function(e,t){return e+t},0)},i=function(e){return e.reduce(function(e,t){return Math.min(e,t)})},r=function(e){return e.reduce(function(e,t){return Math.max(e,t)})},u=function(e,t){var n,r,i,s;return n=e[0],r=e[1],i=t[0],s=t[1],[n+i,r+s]},s=function(e,t){var n,r,i,s;return n=e[0],r=e[1],i=t[0],s=t[1],[n-i,r-s]},l=function(e,t){var n,r;return n=t[0],r=t[1],[e*n,e*r]},n=function(e){var t,n;return t=e[0],n=e[1],Math.sqrt(t*t+n*n)},f=function(e){return e.reduce(function(e,t){return u(e,t)},[0,0])},e=function(e){return l(1/e.length,e.reduce(u))},o=function(e,t){return l(e,[Math.sin(t),-Math.cos(t)])},t=function(e,t){var n,r,i;i=e||{};for(n in i)r=i[n],t[n]=r(t.index,t.item,t.group);return t},{sum:a,min:i,max:r,plus:u,minus:s,times:l,length:n,sum_vectors:f,average:e,on_circle:o,enhance:t}}(),t=function(){return function(e,t){var n,r,i,s;return n=e[0],r=e[1],i=t[0],s=t[1],function(e){return i+(s-i)*(e-n)/(r-n)}}}(),n=function(){var e;return e=function(t){var n,r,i,s,o,u,a;return r=t||[],u=function(e,t){var n;return n=e.slice(0,e.length),n.push(t),n},n=function(e,t){return e[0]===t[0]&&e[1]===t[1]},o=function(e){var t,n;return t=e.command,n=e.params,""+t+" "+n.join(" ")},s=function(e,t){var n,r,i,s;n=e.command,r=e.params,i=t[0],s=t[1];switch(n){case"M":return[r[0],r[1]];case"L":return[r[0],r[1]];case"H":return[r[0],s];case"V":return[i,r[0]];case"Z":return null;case"C":return[r[4],r[5]];case"S":return[r[2],r[3]];case"Q":return[r[2],r[3]];case"T":return[r[0],r[1]];case"A":return[r[5],r[6]]}},a=function(e,t){return function(n){var r;return r=typeof n=="object"?e.map(function(e){return n[e]}):arguments,t.apply(null,r)}},i=function(t){return e(u(r,t))},{moveto:a(["x","y"],function(e,t){return i({command:"M",params:[e,t]})}),lineto:a(["x","y"],function(e,t){return i({command:"L",params:[e,t]})}),hlineto:a(["x"],function(e){return i({command:"H",params:[e]})}),vlineto:a(["y"],function(e){return i({command:"V",params:[e]})}),closepath:function(){return i({command:"Z",params:[]})},curveto:a(["x1","y1","x2","y2","x","y"],function(e,t,n,r,s,o){return i({command:"C",params:[e,t,n,r,s,o]})}),smoothcurveto:a(["x2","y2","x","y"],function(e,t,n,r){return i({command:"S",params:[e,t,n,r]})}),qcurveto:a(["x1","y1","x","y"],function(e,t,n,r){return i({command:"Q",params:[e,t,n,r]})}),smoothqcurveto:a(["x","y"],function(e,t){return i({command:"T",params:[e,t]})}),arc:a(["rx","ry","xrot","large_arc_flag","sweep_flag","x","y"],function(e,t,n,r,s,o,u){return i({command:"A",params:[e,t,n,r,s,o,u]})}),print:function(){return r.map(o).join(" ")},points:function(){var e,t,n,i,o,u;n=[],t=[0,0],i=function(){var r;r=s(e,t),t=r;if(r)return n.push(r)};for(o=0,u=r.length;o<u;o++)e=r[o],i();return n},instructions:function(){return r.slice(0,r.length)},connect:function(t){var r,i,s;return i=this.points().slice(-1)[0],r=t.points()[0],s=t.instructions().slice(1),n(i,r)||s.unshift({command:"L",params:r}),e(this.instructions().concat(s))}}},function(){return e()}}(),r=function(e,t){return function(n){var r,i,s,o,u,a,f;return u=n.points,r=n.closed,s=u.length,i=u[0],a=u.slice(1,+s+1||9e9),o=a.reduce(function(e,t){return e.lineto.apply(e,t)},(f=e()).moveto.apply(f,i)),{path:r?o.closepath():o,centroid:t.average(u)}}}(n,e),i=function(e){return function(t){var n,r,i,s;return r=t.left,i=t.right,s=t.top,n=t.bottom,e({points:[[i,s],[i,n],[r,n],[r,s]],closed:!0})}}(r),s=function(e,t,n){return function(r){var i,s,o,u,a,f,l,c,h,p,d,v,m,g,y,b,w,E,S,x,T,N,C,k,L,A,M,_,D,P,H,B,j,F;f=r.data,i=r.accessor,A=r.width,v=r.height,d=r.gutter,o=r.compute,i==null&&(i=function(e){return e}),d==null&&(d=0),p=[],E=0,w=0;for(m=M=0,H=f.length;M<H;m=++M){a=f[m];for(g=_=0,B=a.length;_<B;g=++_)l=a[g],k=i(l),k<E&&(E=k),k>w&&(w=k),p[g]==null&&(p[g]=[]),p[g][m]=k}S=p.length,h=(A-d*(S-1))/S,u=[],T=t([E,w],[v,0]);for(m=D=0,j=p.length;D<j;m=++D){c=p[m],L=h/c.length,N=(h+d)*m;for(g=P=0,F=c.length;P<F;g=++P)l=c[g],y=N+L*g,x=y+L,s=T(0),C=T(l),b=n({left:y,right:x,bottom:s,top:C}),u.push(e.enhance(o,{item:f[g][m],line:b,index:g}))}return{curves:u,scale:T}}}(e,t,i),o=function(e,t){var n;return n=function(e,n){return t.minus(t.times(2,e),n)},function(r){var i,s,o,u,a,f,l,c,h,p,d,v,m,g,y,b,w,E,S;p=r.points,d=r.tension,d==null&&(d=.3),u=[],f=p.length;for(a=v=1,y=f-1;1<=y?v<=y:v>=y;a=1<=y?++v:--v)u.push(t.times(d,t.minus(p[a],p[a-1])));o=[t.plus(p[0],n(u[0],u[1]))];for(a=m=1,b=f-2;1<=b?m<=b:m>=b;a=1<=b?++m:--m)o.push(t.minus(p[a],t.average([u[a],u[a-1]])));return o.push(t.minus(p[f-1],n(u[f-2],u[f-3]))),i=o[0],s=o[1],l=p[0],c=p[1],h=(w=e()).moveto.apply(w,l).curveto(i[0],i[1],s[0],s[1],c[0],c[1]),{path:function(){S=[];for(var e=2,t=f-1;2<=t?e<=t:e>=t;2<=t?e++:e--)S.push(e);return S}.apply(this).reduce(function(e,t){var n,r;return n=o[t],r=p[t],e.smoothcurveto(n[0],n[1],r[0],r[1])},h),centroid:t.average(p)}}}(n,e),u=function(e,t){return function(n){var r,i,s,o,u,a,f,l,c,h,p,d,v;return c=n.start,u=n.end,h=n.tension,h==null&&(h=.05),r=c[0],i=c[1],s=u[0],o=u[1],a=(s-r)*h,f=[r+a,i],l=[s-a,o],{path:(p=(d=(v=e()).moveto.apply(v,c)).lineto.apply(d,f).curveto(r+5*a,i,s-5*a,o,s-a,o)).lineto.apply(p,u),centroid:t.average([c,u])}}}(n,e),a=function(e,t,n){return function(e){var r,i,s,o,u,a,f,l;return f=e.topleft,l=e.topright,i=e.bottomleft,s=e.bottomright,a=t({start:f,end:l}).path,r=t({start:s,end:i}).path,u=a.connect(r).closepath(),o=n.average([f,l,i,s]),{path:u,centroid:o}}}(n,u,e),f=function(e){var t,n,r,i,s,o,u,a,f,l,c,h,p;return n=function(t,n){var r,i;return r=t.mass+n.mass,i=e.times(1/r,e.plus(e.times(t.mass,t.point),e.times(n.mass,n.point))),[i,r]},o=function(e,t){var n,r,i,s,o,u,a,f,l,c;u=e[0],a=e[1];for(f=0,l=t.length;f<l;f++){i=t[f],c=i.box,o=c.top,n=c.bottom,r=c.left,s=c.right;if(r<=u&&u<=s&&n<=a&&a<=o)return i}},a=function(e,t){var n,r,i,s,o,u,a,f;return f=e.top,i=e.bottom,u=e.left,a=e.right,n=t[0],r=t[1],o=(u+a)/2,s=(f+i)/2,{box:{top:r?s:f,bottom:r?i:s,left:n?o:u,right:n?a:o}}},h=function(e){var t;return t=e.box,[a(t,[0,0]),a(t,[1,0]),a(t,[0,1]),a(t,[1,1])]},t=function(e,r){var i,s,u;return e.body?(s=e.body,delete e.body,e.children=h(e),t(e,s),t(e,r)):e.children?(i=o(r.point,e.children),u=e.point?n(e,r):[r.point,r.mass],e.point=u[0],e.mass=u[1],t(i,r)):e.body=r},l=function(e,n){var r;return e.length===0?n:(r=e.shift(),t(n,r),l(e,n))},u=function(e){var t,n,r;t=[];for(n in e)r=e[n],t.push({id:n,point:r,mass:1});return t},f=function(e,t){return{box:{top:t,bottom:0,left:0,right:e}}},p=function(e,t){var n,r,i,s,o;if(e.body)return t(e);if(e.children){s=e.children,o=[];for(r=0,i=s.length;r<i;r++)n=s[r],o.push(p(n,t));return o}},r=function(t,n,r){var i,s;return s=e.minus(t.point,n.point),i=e.length(s),e.times(r*t.mass*n.mass/(i*i*i),s)},i=function(t){var n,r,i,s;return s=t.top,n=t.bottom,r=t.left,i=t.right,e.length([s-n,i-r])},s=function(t,n,o,u){var a,f;return n===t?[0,0]:n.body?r(t.body,n.body,o):n.point?(f=i(n.box),a=e.length(e.minus(t.body.point,n.point)),f/a<u?r(t.body,n,o):e.sum_vectors(n.children.map(function(e){return s(t,e,o,u)}))):[0,0]},c=function(e,t,n){var r;return r={},p(e,function(i){return r[i.body.id]=s(i,e,t,n)}),r},{tree:l,bodies:u,root:f,forces:c}}(e),l=function(e,t,n){var r,i,s,o,u;return u=function(e,t){return[Math.random()*e,Math.random()*t]},i=function(e,t){return Math.min(Math.max(t,0),e)},s=function(e,t){return function(n){var r,s;return r=n[0],s=n[1],[i(e,r),i(t,s)]}},o=function(e,t){var n,r,i;r=[];for(n in e)i=e[n],r.push(t(n,i));return r},r=function(e,n,r){var i,s,o,u,a,f,l,c,h;o={};for(u in e)h=e[u],l=h.start,i=h.end,c=h.weight,a=n[l],f=n[i],s=t.times(r*c,t.minus(a,f)),o[l]==null&&(o[l]=[0,0]),o[i]==null&&(o[i]=[0,0]),o[l]=t.minus(o[l],s),o[i]=t.plus(o[i],s);return o},function(i){var a,f,l,c,h,p,d,v,m,g,y,b,w,E,S,x,T,N,C,k,L,A,M,_,D,P,H,B,j,F,I;h=i.data,S=i.nodeaccessor,y=i.linkaccessor,P=i.width,v=i.height,a=i.attraction,k=i.repulsion,A=i.threshold,S==null&&(S=function(e){return e}),y==null&&(y=function(e){return e}),a==null&&(a=1),k==null&&(k=1),A==null&&(A=.5),f=s(P,v),x=h.nodes,b=h.links,c=h.constraints,c==null&&(c={}),N={},T={};for(H=0,j=x.length;H<j;H++)E=x[H],m=S(E),N[m]=c[m]||u(P,v),T[m]=E;w={};for(B=0,F=b.length;B<F;B++)g=b[B],I=y(g),L=I.start,p=I.end,D=I.weight,w[""+L+"|"+p]={weight:D,start:L,end:p,link:g};return M=function(){var e,i,s,o,u,l,h,p,d;i=n.bodies(N),p=n.root(P,v),d=n.tree(i,p),e=r(w,N,a/1e3),h=n.forces(d,k*1e3,A);for(m in N)l=N[m],c[m]?N[m]=c[m]:(o=e[m]||[0,0],u=h[m]||[0,0],s=t.plus(o,u),N[m]=f(t.plus(l,s)));return C()},l=function(e,t){return c[e]=t},_=function(e){return delete c[e]},d={tick:M,constrain:l,unconstrain:_},C=function(){var t;return t=-1,d.curves=o(w,function(n,r){var i,s,o,u,a;return a=r.start,i=r.end,s=r.link,t+=1,o=N[a],u=N[i],{link:e({points:[o,u],closed:!1}),item:s,index:t}}),d.nodes=o(T,function(e,t){return{point:N[e],item:t}}),d},C()}}(r,e,f),c=[].slice,h=function(e,t){return function(n){var r,i,s,o,u,a,f,l,h,p,d,v,m,g,y,b,w,E;return u=n.center,m=n.r,r=n.R,g=n.start,l=n.end,i=t.plus(u,t.on_circle(r,g)),s=t.plus(u,t.on_circle(r,l)),o=t.plus(u,t.on_circle(m,l)),f=t.plus(u,t.on_circle(m,g)),h=l-g>Math.PI?1:0,v=(y=(b=(w=(E=e()).moveto.apply(E,i)).arc.apply(w,[r,r,0,h,1].concat(c.call(s)))).lineto.apply(b,o)).arc.apply(y,[m,m,0,h,0].concat(c.call(f))).closepath(),p=(g+l)/2,d=(m+r)/2,a=t.plus(u,t.on_circle(d,p)),{path:v,centroid:a}}}(n,e),p=function(e,t,n){return function(r){var i,s,o,u,a,f,l,c,h,p,d,v,m,g,y,b;f=r.data,s=r.accessor,o=r.center,h=r.r,i=r.R,u=r.compute,g=function(){var e,t,n;n=[];for(e=0,t=f.length;e<t;e++)c=f[e],n.push(s(c));return n}(),p=t.sum(g),d=e([0,p],[0,2*Math.PI]),a=[],v=0;for(l=y=0,b=f.length;y<b;l=++y)c=f[l],m=g[l],a.push(t.enhance(u,{item:c,index:l,sector:n({center:o,r:h,R:i,start:d(v),end:d(v+m)})})),v+=m;return{curves:a}}}(t,e,h),d=function(e,t){return function(n){var r,i,s,o;return i=n.center,o=n.radii,r=2*Math.PI/o.length,s=o.map(function(e,n){return t.plus(i,t.on_circle(e,n*r))}),e({points:s,closed:!0})}}(r,e),v=function(e,t){var n,r,i;return n=function(e){var t,n,r,i,s,o,u,a,f,l;n=[],r=function(){var t,n,r;r=[];for(t=0,n=e.length;t<n;t++)i=e[t],r.push(Object.keys(i));return r}();for(o=0,a=e.length;o<a;o++){s=e[o],l=Object.keys(s);for(u=0,f=l.length;u<f;u++)t=l[u],n.indexOf(t)===-1&&n.push(t)}return n},i=function(e){var t,n,r,i,s;t={},r=function(e){return t[e]=function(t){return t[e]}};for(i=0,s=e.length;i<s;i++)n=e[i],r(n);return t},r=function(e,n){var r,i;return r=Object.keys(n),i=e.map(function(e){var i;return i=r.map(function(t){return n[t](e)}),t.max(i)}),t.max(i)},function(s){var o,u,a,f,l,c,h,p,d,v,m,g,y,b,w;return l=s.data,o=s.accessor,a=s.center,v=s.r,p=s.max,g=s.rings,f=s.compute,g==null&&(g=3),o==null&&(o=i(n(l))),h=Object.keys(o),y=h.length,u=2*Math.PI/y,c=-1,p==null&&(p=r(l,o)),m=function(){w=[];for(var e=1;1<=g?e<=g:e>=g;1<=g?e++:e--)w.push(e);return w}.apply(this).map(function(t){var n,r,i,s;return n=v*t/g,e({center:a,radii:function(){s=[];for(var e=0,t=y-1;0<=t?e<=t:e>=t;0<=t?e++:e--)s.push(e);return s}.apply(this).map(function(e){return n})})}),d=l.map(function(n){return c+=1,t.enhance(f,{polygon:e({center:a,radii:h.map(function(e){return v*o[e](n)/p})}),item:n,index:c})}),{curves:d,rings:m}}}(d,e),m=function(e,t,n){return function(r){var i,s,o,u,a,f,l,c,h,p,d,v,m,g,y,b,w,E,S,x,T,N;o=r.data,d=r.node_accessor,l=r.link_accessor,N=r.width,a=r.height,u=r.gutter,g=r.rect_width,i=r.compute,d==null&&(d=function(e){return e}),l==null&&(l=function(e){return e}),u==null&&(u=10),g==null&&(g=10),c=o.links.map(l),m=o.nodes.map(function(e){return e.map(d)}),E=(N-g)/(o.nodes.length-1),p={},m.reduce(function(e,t){return e.concat(t)}).forEach(function(e){return p[e]={value:0,currently_used_in:0,currently_used_out:0}});for(h in p)x=c.filter(function(e){return e.end===h}).map(function(e){return e.weight}).reduce(function(e,t){return e+t},0),T=c.filter(function(e){return e.start===h}).map(function(e){return e.weight}).reduce(function(e,t){return e+t},0),p[h].value=Math.max(x,T);f=m.map(function(e){return e.map(function(e){return p[e].value}).reduce(function(e,t){return e+t})}),w=m.map(function(e){return a-(e.length-1)*u}),b=f.map(function(e,t){return w[t]/e}).reduce(function(e,t){return Math.min(e,t)});for(h in p)S=p[h],p[h].scaled_value=b*S.value;return y=[],v=-1,m.forEach(function(t,r){var s,f,l,c;return f=t.reduce(function(e,t){return e+p[t].scaled_value},0)+(t.length-1)*u,c=(a-f)/2,s=c,l=s-u,t.forEach(function(t,s){var a,f,c;return c=l+u,f=c+p[t].scaled_value,l=f,a=p[t].rectangle_coords={top:c,bottom:f,left:g/2+r*E-g/2,right:g/2+r*E+g/2},v+=1,y.push(n.enhance(i,{curve:e(a),item:o.nodes[r][s],index:v,group:r}))})}),s=c.map(function(e,r){var s,u,a,f,l,c,h,d;return h=e.start,d=e.end,f=p[h].rectangle_coords,l=p[d].rectangle_coords,c=e.weight*b,s=f.top+p[h].currently_used_out,u=l.top+p[d].currently_used_in,a={topleft:[f.right,s],topright:[l.left,u],bottomleft:[f.right,s+c],bottomright:[l.left,u+c]},p[h].currently_used_out=p[h].currently_used_out+c,p[d].currently_used_in=p[d].currently_used_in+c,n.enhance(i,{curve:t(a),item:o.links[r],index:r})}),{curvedRectangles:s,rectangles:y}}}(i,a,e),g=function(e,t){var n;return n=function(e,n){var r,i,s,o,u;return s=function(){var t,i,s;s=[];for(t=0,i=e.length;t<i;t++)r=e[t],s.push(n(r));return s}(),o=s.sort(function(e,t){var n,r,i,s;return n=e[0],r=e[1],i=t[0],s=t[1],n-i}),u=o.map(function(e){return e[1]}),i=o.length,{points:o,xmin:o[0][0],xmax:o[i-1][0],ymin:t.min(u),ymax:t.max(u)}},function(r){var i,s,o,u,a,f,l,c,h,p,d,v,m,g,y,b,w;return u=r.data,p=r.xaccessor,g=r.yaccessor,h=r.width,l=r.height,o=r.closed,p==null&&(p=function(e){var t,n;return t=e[0],n=e[1],t}),g==null&&(g=function(e){var t,n;return t=e[0],n=e[1],n}),f=function(e){return[p(e),g(e)]},i=function(){var e,t,r;r=[];for(e=0,t=u.length;e<t;e++)a=u[e],r.push(n(a,f));return r}(),v=t.min(i.map(function(e){return e.xmin})),d=t.max(i.map(function(e){return e.xmax})),b=t.min(i.map(function(e){return e.ymin})),y=t.max(i.map(function(e){return e.ymax})),o&&(b=Math.min(b,0),y=Math.max(y,0)),s=o?0:b,m=e([v,d],[0,h]),w=e([b,y],[l,0]),c=function(e){var t,n;return t=e[0],n=e[1],[m(t),w(n)]},{arranged:i,scale:c,xscale:m,yscale:w,base:s}}}(t,e),y=function(e,t,n){return function(r){var i,s,o,u,a,f,l,c;return c=n(r),i=c.arranged,a=c.scale,f=c.xscale,l=c.yscale,s=c.base,o=-1,u=i.map(function(n){var i,u,f,l,c,h,p,d;return f=n.points,h=n.xmin,c=n.xmax,l=f.map(a),o+=1,u=e({points:l}),i={path:(p=(d=u.path).lineto.apply(d,a([c,s]))).lineto.apply(p,a([h,s])).closepath(),centroid:t.average([u.centroid,a([h,s]),a([c,s])])},t.enhance(r.compute,{item:r.data[o],line:u,area:i,index:o})}),{curves:u,xscale:f,yscale:l}}}(o,e,g),b=function(e,t,n){return function(r){var i,s,o,u,a,f,l,c;return c=t(r),i=c.arranged,a=c.scale,f=c.xscale,l=c.yscale,s=c.base,o=-1,u=i.map(function(t){var i,u,f,l,c;return i=t.points,c=t.xmin,l=t.xmax,u=i.map(a),i.push([l,s]),i.push([c,s]),f=i.map(a),o+=1,n.enhance(r.compute,{item:r.data[o],line:e({points:u,closed:!1}),area:e({points:f,closed:!0}),index:o})}),{curves:u,xscale:f,yscale:l}}}(r,g,e),w=function(){var e,t,n,r,i;return n=function(e,t){return e==null&&(e=[]),e.reduce(function(e,n){return Math.max(e,t(n))},0)},i=function(e){return 1+n(e.children,i)},e=function(t,n,r){var i,s;return r==null&&(r=0),s={item:t,level:r},i=n(t),i&&i.length&&(s.children=i.map(function(t){return e(t,n,r+1)})),s},r=function(e,t,n){var i,s,o,u;n==null&&(n=[]),t==null&&(t=0),n[t]!=null?(e.height=n[t]+1,n[t]+=1):(n[t]=0,e.height=0),u=e.children||[];for(s=0,o=u.length;s<o;s++)i=u[s],r(i,t+1,n);return n},t=function(e,n){var r,i,s,o,u;i=[],u=e.children||[];for(s=0,o=u.length;s<o;s++)r=u[s],i.push(n(e,r)),i=i.concat(t(r,n));return i},{tree_height:i,build_tree:e,set_height:r,collect:t}}(),E=function(e,t,n){return function(r){var i,s,o,u,a,f,l,c,h,p,d,v,m,g,y,b,w,E,S;return u=r.data,b=r.width,a=r.height,s=r.children,m=r.tension,s==null&&(s=function(e){return e.children}),g=n.build_tree(u,s),h=n.tree_height(g),p=n.set_height(g),l=b/(h-1),f=t([0,h-1],[0,b]),y=function(){S=[];for(var e=0,t=h-1;0<=t?e<=t:e>=t;0<=t?e++:e--)S.push(e);return S}.apply(this).map(function(e){var n,r,i,s;return n=Math.sqrt(e/(h-1))*a,s=(a-n)/2,r=s+n,i=e>0?p[e]+p[e-1]:p[e],i===0?function(e){return a/2}:t([0,i],[s,r])}),d=function(e){var t,n;return t=e.level,n=y[t],[f(t),n(e.height_)]},c=-1,o=n.collect(g,function(t,n){return c+=1,n.height_=n.height+t.height,{connector:e({start:d(t),end:d(n),tension:m}),index:c,item:{start:t.item,end:n.item}}}),i=n.collect(g,function(e,t){return{point:d(t),item:t.item}}),v={point:d(g),item:g.item},{curves:o,nodes:[v].concat(i)}}}(u,t,w),S=function(e,t,n){return function(r){var i,s,o,u,a,f,l,c,h,p,d,v,m,g,y,b,w,E,S,x,T,N,C,k,L,A,M,_,D,P,H,B,j;h=r.data,o=r.accessor,M=r.width,v=r.height,d=r.gutter,f=r.compute,T=r.min,x=r.max,o==null&&(o=function(e){return e}),d==null&&(d=0),T==null&&(T=0),x==null&&(x=0),y=0,p=[];for(_=0,P=h.length;_<P;_++)c=h[_],B=o(c),A=B.value,s=B.absolute,j=s?[0,A||y]:[y,y+A],E=j[0],m=j[1],S=Math.min(E,m),i=Math.max(E,m),T=Math.min(T,S),x=Math.max(x,i),y=m,p.push({item:c,low:E,high:m,value:A!=null?A:m});N=p.length,u=(M-d*(N-1))/N,l=[],k=t([T,x],[v,0]);for(g=D=0,H=p.length;D<H;g=++D)c=p[g],b=g*(u+d),C=b+u,a=k(c.low),L=k(c.high),w=n({left:b,right:C,bottom:a,top:L}),l.push(e.enhance(f,{item:c.item,line:w,value:c.value,index:g}));return{curves:l,scale:k}}}(e,t,i),x=function(e,t,n,r,i,s,o,u,a,f,l,c,h,p,d,v,m,g,y){return window.paths={Bar:e,Bezier:t,Connector:n,CurvedRectangle:r,Graph:i,Linear:s,Ops:o,Path:u,Pie:a,Polygon:f,Radar:l,Rectangle:c,Sankey:h,Sector:p,SemiRegularPolygon:d,SmoothLine:v,Stock:m,Tree:g,Waterfall:y}}(s,o,u,a,l,t,e,n,p,r,v,i,m,h,d,y,b,E,S)})();

});

require.register("patron_page", function(exports, require, module) {
var NavBar = require("navbar")

var PatronPage = React.createClass({displayName: 'PatronPage',
  render: function() {
    return (
      React.createElement("div", {style: {height:"100%",overflow:"hidden"}}, 
        React.createElement(NavBar, null), 
        React.createElement("div", {style: {height:"100%",marginTop:5,position:"relative"}}, 
        React.createElement("div", {style: {height:"100%",width:"100%",position:"absolute",backgroundColor:"rgba(0,0,0,0.3)",marginTop:-5,zIndex:1}}, " "), 
        

        React.createElement("div", {className: "cover-photo", 
          style: {backgroundImage:'url("https://i1.sndcdn.com/avatars-000050744666-qup0ih-t500x500.jpg")',backgroundSize:"cover",position:"absolute",top:0,left:0,width:"100%",height:"100%"
          }}), 
        React.createElement("div", {className: "col-md-7"}, 
          React.createElement("img", {src: "https://i1.sndcdn.com/avatars-000050744666-qup0ih-t500x500.jpg", style: {height:200,width:200,border:"1px solid white",position:"absolute",top:50,left:50,borderRadius:10,zIndex:2}}), 
          React.createElement("h1", {style: {marginLeft:50,marginTop:300,fontWeight:800,color:"white",position:"relative",zIndex:4}}, "967 ", React.createElement("small", {style: {color:"white"}}, "supporters ")), 
          React.createElement("h1", {style: {marginLeft:50,marginTop:10,fontWeight:800,color:"white",position:"relative",zIndex:40}}, "$1.5K ", React.createElement("small", {style: {color:"white"}}, "revenue ")), 
          React.createElement("h1", {style: {marginLeft:50,marginTop:10,fontWeight:800,color:"white",position:"relative",zIndex:40}}, "21K ", React.createElement("small", {style: {color:"white"}}, "followers ")), 
          React.createElement("div", {style: {position:"absolute",top:50,left:300,zIndex:2,color:"white"}}, 
          React.createElement("h1", null, "The Combat Jack Show"), 
          React.createElement("h3", null, "The Combat Jack Show"), 
          React.createElement("h5", null, 
"The undisputed #1 HipHop podcast, the Combat Jack Show features interviews with HipHop icons & the most in-depth conversations about music, news, culture & race. Listen to Russell Simmons, Chuck D, Damon Dash, Rza, Scarface, D-Nice and more share personal stories and talk exclusively about their journeys, philosophies and viewpoints."
          ), 

          React.createElement("div", {className: "panel teal-green"}
          )
          )
        ), 
      React.createElement("div", {className: "col-md-5", style: {height:"100%",position:"relative",zIndex:5,textAlign:"center",marginTop:-5}}, 
        React.createElement("div", {className: "teal-green-sp", style: {height:"100%",position:"absolute",width:"100%",zIndex:5,opacity:0.7}}), 
        React.createElement("div", {style: {position:"relative",zIndex:10,color:"white"}}, 
          React.createElement("br", null), 
          React.createElement("h1", {style: {fontWeight:600}}, "GET INVOLVED"), 
          React.createElement("hr", {style: {marginLeft:10}}), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("a", {href: "javascript:", className: "big-btn btn-lg btn btn-primary"}, "SUBSCRIBE TO UPDATESi   ", React.createElement("i", {className: "fa fa-arrow-right", style: {float:"right"}})), 

          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          
          React.createElement("a", {href: "javascript:", className: "big-btn btn-lg btn btn-primary"}, "BECOME A SUPPORTER  ", React.createElement("i", {className: "fa fa-arrow-right", style: {float:"right"}}))
        )
      )
      )
        
      )
    )
  }
})

module.exports = PatronPage

});

;require.register("range_slider", function(exports, require, module) {
//var Slider = require("bootstrap-slider");

var RangeSlider = React.createClass({displayName: 'RangeSlider',
  componentDidMount: function() {
    //$(".selector").slider({ from: 5, to: 50})
   $( "#slider-range" ).slider({
      range: true,
      min: 0,
      max: 500,
      values: [ 75, 300 ],
      slide: function( event, ui ) {
        $( "#amount" ).val( "$" + ui.values[ 0 ] + " - $" + ui.values[ 1 ] );
      }
    });
  },
  render: function() {
    return (
      React.createElement("div", null, 
        "The range slider", 
        React.createElement("input", {type: "text", id: "amount"}), 

        React.createElement("div", {id: "slider-range"})
 
      )
    )
  }
})

module.exports = RangeSlider

});

;require.register("react-typeahead", function(exports, require, module) {
!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var f;"undefined"!=typeof window?f=window:"undefined"!=typeof global?f=global:"undefined"!=typeof self&&(f=self),f.ReactTypeahead=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
/*
 * Fuzzy
 * https://github.com/myork/fuzzy
 *
 * Copyright (c) 2012 Matt York
 * Licensed under the MIT license.
 */

(function() {

var root = this;

var fuzzy = {};

// Use in node or in browser
if (typeof exports !== 'undefined') {
  module.exports = fuzzy;
} else {
  root.fuzzy = fuzzy;
}

// Return all elements of `array` that have a fuzzy
// match against `pattern`.
fuzzy.simpleFilter = function(pattern, array) {
  return array.filter(function(string) {
    return fuzzy.test(pattern, string);
  });
};

// Does `pattern` fuzzy match `string`?
fuzzy.test = function(pattern, string) {
  return fuzzy.match(pattern, string) !== null;
};

// If `pattern` matches `string`, wrap each matching character
// in `opts.pre` and `opts.post`. If no match, return null
fuzzy.match = function(pattern, string, opts) {
  opts = opts || {};
  var patternIdx = 0
    , result = []
    , len = string.length
    , totalScore = 0
    , currScore = 0
    // prefix
    , pre = opts.pre || ''
    // suffix
    , post = opts.post || ''
    // String to compare against. This might be a lowercase version of the
    // raw string
    , compareString =  opts.caseSensitive && string || string.toLowerCase()
    , ch, compareChar;

  pattern = opts.caseSensitive && pattern || pattern.toLowerCase();

  // For each character in the string, either add it to the result
  // or wrap in template if its the next string in the pattern
  for(var idx = 0; idx < len; idx++) {
    ch = string[idx];
    if(compareString[idx] === pattern[patternIdx]) {
      ch = pre + ch + post;
      patternIdx += 1;

      // consecutive characters should increase the score more than linearly
      currScore += 1 + currScore;
    } else {
      currScore = 0;
    }
    totalScore += currScore;
    result[result.length] = ch;
  }

  // return rendered string if we have a match for every char
  if(patternIdx === pattern.length) {
    return {rendered: result.join(''), score: totalScore};
  }

  return null;
};

// The normal entry point. Filters `arr` for matches against `pattern`.
// It returns an array with matching values of the type:
//
//     [{
//         string:   '<b>lah' // The rendered string
//       , index:    2        // The index of the element in `arr`
//       , original: 'blah'   // The original element in `arr`
//     }]
//
// `opts` is an optional argument bag. Details:
//
//    opts = {
//        // string to put before a matching character
//        pre:     '<b>'
//
//        // string to put after matching character
//      , post:    '</b>'
//
//        // Optional function. Input is an element from the passed in
//        // `arr`, output should be the string to test `pattern` against.
//        // In this example, if `arr = [{crying: 'koala'}]` we would return
//        // 'koala'.
//      , extract: function(arg) { return arg.crying; }
//    }
fuzzy.filter = function(pattern, arr, opts) {
  opts = opts || {};
  return arr
          .reduce(function(prev, element, idx, arr) {
            var str = element;
            if(opts.extract) {
              str = opts.extract(element);
            }
            var rendered = fuzzy.match(pattern, str, opts);
            if(rendered != null) {
              prev[prev.length] = {
                  string: rendered.rendered
                , score: rendered.score
                , index: idx
                , original: element
              };
            }
            return prev;
          }, [])

          // Sort by score. Browsers are inconsistent wrt stable/unstable
          // sorting, so force stable by using the index in the case of tie.
          // See http://ofb.net/~sethml/is-sort-stable.html
          .sort(function(a,b) {
            var compare = b.score - a.score;
            if(compare) return compare;
            return a.index - b.index;
          });
};


}());


},{}],2:[function(require,module,exports){
/**
 * PolyFills make me sad
 */
var KeyEvent = KeyEvent || {};
KeyEvent.DOM_VK_UP = KeyEvent.DOM_VK_UP || 38;
KeyEvent.DOM_VK_DOWN = KeyEvent.DOM_VK_DOWN || 40;
KeyEvent.DOM_VK_BACK_SPACE = KeyEvent.DOM_VK_BACK_SPACE || 8;
KeyEvent.DOM_VK_RETURN = KeyEvent.DOM_VK_RETURN || 13;
KeyEvent.DOM_VK_ENTER = KeyEvent.DOM_VK_ENTER || 14;
KeyEvent.DOM_VK_ESCAPE = KeyEvent.DOM_VK_ESCAPE || 27;
KeyEvent.DOM_VK_TAB = KeyEvent.DOM_VK_TAB || 9;

module.exports = KeyEvent;

},{}],3:[function(require,module,exports){
var Typeahead = require('./typeahead');
var Tokenizer = require('./tokenizer');

module.exports = {
  Typeahead: Typeahead,
  Tokenizer: Tokenizer
};

},{"./tokenizer":4,"./typeahead":6}],4:[function(require,module,exports){
/**
 * @jsx React.DOM
 */

var React = window.React || require('react');
var Token = require('./token');
var KeyEvent = require('../keyevent');
var Typeahead = require('../typeahead');

/**
 * A typeahead that, when an option is selected, instead of simply filling
 * the text entry widget, prepends a renderable "token", that may be deleted
 * by pressing backspace on the beginning of the line with the keyboard.
 */
var TypeaheadTokenizer = React.createClass({displayName: "TypeaheadTokenizer",
  propTypes: {
    options: React.PropTypes.array,
    customClasses: React.PropTypes.object,
    defaultSelected: React.PropTypes.array,
    defaultValue: React.PropTypes.string,
    placeholder: React.PropTypes.string,
    onTokenRemove: React.PropTypes.func,
    onTokenAdd: React.PropTypes.func
  },

  getInitialState: function() {
    return {
      selected: this.props.defaultSelected
    };
  },

  getDefaultProps: function() {
    return {
      options: [],
      defaultSelected: [],
      customClasses: {},
      defaultValue: "",
      placeholder: "",
      onTokenAdd: function() {},
      onTokenRemove: function() {}
    };
  },

  // TODO: Support initialized tokens
  //
  _renderTokens: function() {
    var tokenClasses = {}
    tokenClasses[this.props.customClasses.token] = !!this.props.customClasses.token;
    var classList = React.addons.classSet(tokenClasses);
    var result = this.state.selected.map(function(selected) {
      return (
        React.createElement(Token, {key: selected, className: classList, 
          onRemove:  this._removeTokenForValue}, 
          selected 
        )
      )
    }, this);
    return result;
  },

  _getOptionsForTypeahead: function() {
    // return this.props.options without this.selected
    return this.props.options;
  },

  _onKeyDown: function(event) {
    // We only care about intercepting backspaces
    if (event.keyCode !== KeyEvent.DOM_VK_BACK_SPACE) {
      return;
    }

    // No tokens
    if (!this.state.selected.length) {
      return;
    }

    // Remove token ONLY when bksp pressed at beginning of line
    // without a selection
    var entry = this.refs.typeahead.refs.entry.getDOMNode();
    if (entry.selectionStart == entry.selectionEnd &&
        entry.selectionStart == 0) {
      this._removeTokenForValue(
        this.state.selected[this.state.selected.length - 1]);
      event.preventDefault();
    }
  },

  _removeTokenForValue: function(value) {
    var index = this.state.selected.indexOf(value);
    if (index == -1) {
      return;
    }

    this.state.selected.splice(index, 1);
    this.setState({selected: this.state.selected});
    this.props.onTokenRemove(this.state.selected);
    return;
  },

  _addTokenForValue: function(value) {
    if (this.state.selected.indexOf(value) != -1) {
      return;
    }
    this.state.selected.push(value);
    this.setState({selected: this.state.selected});
    this.refs.typeahead.setEntryText("");
    this.props.onTokenAdd(this.state.selected);
  },

  render: function() {
    var classes = {}
    classes[this.props.customClasses.typeahead] = !!this.props.customClasses.typeahead;
    var classList = React.addons.classSet(classes);
    return (
      React.createElement("div", null, 
         this._renderTokens(), 
        React.createElement(Typeahead, {ref: "typeahead", 
          className: classList, 
          placeholder: this.props.placeholder, 
          customClasses: this.props.customClasses, 
          options: this._getOptionsForTypeahead(), 
          defaultValue: this.props.defaultValue, 
          onOptionSelected: this._addTokenForValue, 
          onKeyDown: this._onKeyDown})
      )
    )
  }
});

module.exports = TypeaheadTokenizer;

},{"../keyevent":2,"../typeahead":6,"./token":5,"react":"react"}],5:[function(require,module,exports){
/**
 * @jsx React.DOM
 */

var React = window.React || require('react');

/**
 * Encapsulates the rendering of an option that has been "selected" in a
 * TypeaheadTokenizer
 */
var Token = React.createClass({displayName: "Token",
  propTypes: {
    children: React.PropTypes.string,
    onRemove: React.PropTypes.func
  },

  render: function() {
    return (
      React.createElement("div", React.__spread({},  this.props, {className: "typeahead-token"}), 
        this.props.children, 
        this._makeCloseButton()
      )
    );
  },

  _makeCloseButton: function() {
    if (!this.props.onRemove) {
      return "";
    }
    return (
      React.createElement("a", {className: "typeahead-token-close", href: "#", onClick: function(event) {
          this.props.onRemove(this.props.children);
          event.preventDefault();
        }.bind(this)}, "×")
    );
  }
});

module.exports = Token;

},{"react":"react"}],6:[function(require,module,exports){
/**
 * @jsx React.DOM
 */

var React = window.React || require('react/addons');
var TypeaheadSelector = require('./selector');
var KeyEvent = require('../keyevent');
var fuzzy = require('fuzzy');

/**
 * A "typeahead", an auto-completing text input
 *
 * Renders an text input that shows options nearby that you can use the
 * keyboard or mouse to select.  Requires CSS for MASSIVE DAMAGE.
 */
var Typeahead = React.createClass({displayName: "Typeahead",
  propTypes: {
    customClasses: React.PropTypes.object,
    maxVisible: React.PropTypes.number,
    options: React.PropTypes.array,
    defaultValue: React.PropTypes.string,
    placeholder: React.PropTypes.string,
    onOptionSelected: React.PropTypes.func,
    onKeyDown: React.PropTypes.func
  },

  getDefaultProps: function() {
    return {
      options: [],
      customClasses: {},
      defaultValue: "",
      placeholder: "",
      onKeyDown: function(event) { return },
      onOptionSelected: function(option) { }
    };
  },

  getInitialState: function() {
    return {
      // The set of all options... Does this need to be state?  I guess for lazy load...
      options: this.props.options,

      // The currently visible set of options
      visible: this.getOptionsForValue(this.props.defaultValue, this.props.options),

      // This should be called something else, "entryValue"
      entryValue: this.props.defaultValue,

      // A valid typeahead value
      selection: null
    };
  },

  getOptionsForValue: function(value, options) {
    var result = fuzzy.filter(value, options).map(function(res) {
      return res.string;
    });

    if (this.props.maxVisible) {
      result = result.slice(0, this.props.maxVisible);
    }
    return result;
  },

  setEntryText: function(value) {
    this.refs.entry.getDOMNode().value = value;
    this._onTextEntryUpdated();
  },

  _renderIncrementalSearchResults: function() {
    // Nothing has been entered into the textbox
    if (!this.state.entryValue) {
      return "";
    }

    // Something was just selected
    if (this.state.selection) {
      return "";
    }

    // There are no typeahead / autocomplete suggestions
    if (!this.state.visible.length) {
      return "";
    }

    return (
      React.createElement(TypeaheadSelector, {
        ref: "sel", options:  this.state.visible, 
        onOptionSelected:  this._onOptionSelected, 
        customClasses: this.props.customClasses})
   );
  },

  _onOptionSelected: function(option, event) {
    var nEntry = this.refs.entry.getDOMNode();
    nEntry.focus();
    nEntry.value = option;
    this.setState({visible: this.getOptionsForValue(option, this.state.options),
                   selection: option,
                   entryValue: option});
    return this.props.onOptionSelected(option, event);
  },

  _onTextEntryUpdated: function() {
    var value = this.refs.entry.getDOMNode().value;
    this.setState({visible: this.getOptionsForValue(value, this.state.options),
                   selection: null,
                   entryValue: value});
  },

  _onEnter: function(event) {
    if (!this.refs.sel.state.selection) {
      return this.props.onKeyDown(event);
    }
    return this._onOptionSelected(this.refs.sel.state.selection, event);
  },

  _onEscape: function() {
    this.refs.sel.setSelectionIndex(null)
  },

  _onTab: function(event) {
    var option = this.refs.sel.state.selection ?
      this.refs.sel.state.selection : this.state.visible[0];
    return this._onOptionSelected(option, event);
  },

  eventMap: function(event) {
    var events = {};

    events[KeyEvent.DOM_VK_UP] = this.refs.sel.navUp;
    events[KeyEvent.DOM_VK_DOWN] = this.refs.sel.navDown;
    events[KeyEvent.DOM_VK_RETURN] = events[KeyEvent.DOM_VK_ENTER] = this._onEnter;
    events[KeyEvent.DOM_VK_ESCAPE] = this._onEscape;
    events[KeyEvent.DOM_VK_TAB] = this._onTab;

    return events;
  },

  _onKeyDown: function(event) {
    // If there are no visible elements, don't perform selector navigation.
    // Just pass this up to the upstream onKeydown handler
    if (!this.refs.sel) {
      return this.props.onKeyDown(event);
    }

    var handler = this.eventMap()[event.keyCode];

    if (handler) {
      handler(event);
    } else {
      return this.props.onKeyDown(event);
    }
    // Don't propagate the keystroke back to the DOM/browser
    event.preventDefault();
  },

  render: function() {
    var inputClasses = {}
    inputClasses[this.props.customClasses.input] = !!this.props.customClasses.input;
    var inputClassList = React.addons.classSet(inputClasses)

    var classes = {
      typeahead: true
    }
    classes[this.props.className] = !!this.props.className;
    var classList = React.addons.classSet(classes);

    return (
      React.createElement("div", {className: classList}, 
        React.createElement("input", {ref: "entry", type: "text", 
          placeholder: this.props.placeholder, 
          className: inputClassList, defaultValue: this.state.entryValue, 
          onChange: this._onTextEntryUpdated, onKeyDown: this._onKeyDown}), 
         this._renderIncrementalSearchResults() 
      )
    );
  }
});

module.exports = Typeahead;

},{"../keyevent":2,"./selector":8,"fuzzy":1,"react/addons":"react/addons"}],7:[function(require,module,exports){
/**
 * @jsx React.DOM
 */

var React = window.React || require('react/addons');

/**
 * A single option within the TypeaheadSelector
 */
var TypeaheadOption = React.createClass({displayName: "TypeaheadOption",
  propTypes: {
    customClasses: React.PropTypes.object,
    onClick: React.PropTypes.func,
    children: React.PropTypes.string
  },

  getDefaultProps: function() {
    return {
      customClasses: {},
      onClick: function(event) {
        event.preventDefault();
      }
    };
  },

  getInitialState: function() {
    return {
      hover: false
    };
  },

  render: function() {
    var classes = {
      hover: this.props.hover
    }
    classes[this.props.customClasses.listItem] = !!this.props.customClasses.listItem;
    var classList = React.addons.classSet(classes);

    return (
      React.createElement("li", {className: classList, onClick: this._onClick}, 
        React.createElement("a", {href: "#", className: this._getClasses(), ref: "anchor"}, 
           this.props.children
        )
      )
    );
  },

  _getClasses: function() {
    var classes = {
      "typeahead-option": true,
    };
    classes[this.props.customClasses.listAnchor] = !!this.props.customClasses.listAnchor;
    return React.addons.classSet(classes);
  },

  _onClick: function(event) {
    event.preventDefault();
    return this.props.onClick(event);
  }
});


module.exports = TypeaheadOption;

},{"react/addons":"react/addons"}],8:[function(require,module,exports){
/**
 * @jsx React.DOM
 */

var React = window.React || require('react/addons');
var TypeaheadOption = require('./option');

/**
 * Container for the options rendered as part of the autocompletion process
 * of the typeahead
 */
var TypeaheadSelector = React.createClass({displayName: "TypeaheadSelector",
  propTypes: {
    options: React.PropTypes.array,
    customClasses: React.PropTypes.object,
    selectionIndex: React.PropTypes.number,
    onOptionSelected: React.PropTypes.func
  },

  getDefaultProps: function() {
    return {
      selectionIndex: null,
      customClasses: {},
      onOptionSelected: function(option) { }
    };
  },

  getInitialState: function() {
    return {
      selectionIndex: this.props.selectionIndex,
      selection: this.getSelectionForIndex(this.props.selectionIndex)
    };
  },

  render: function() {
    var classes = {
      "typeahead-selector": true
    };
    classes[this.props.customClasses.results] = this.props.customClasses.results;
    var classList = React.addons.classSet(classes);

    var results = this.props.options.map(function(result, i) {
      return (
        React.createElement(TypeaheadOption, {ref: result, key: result, 
          hover: this.state.selectionIndex === i, 
          customClasses: this.props.customClasses, 
          onClick: this._onClick.bind(this, result)}, 
          result 
        )
      );
    }, this);
    return React.createElement("ul", {className: classList}, results );
  },

  setSelectionIndex: function(index) {
    this.setState({
      selectionIndex: index,
      selection: this.getSelectionForIndex(index),
    });
  },

  getSelectionForIndex: function(index) {
    if (index === null) {
      return null;
    }
    return this.props.options[index];
  },

  _onClick: function(result, event) {
    return this.props.onOptionSelected(result, event);
  },

  _nav: function(delta) {
    if (!this.props.options) {
      return;
    }
    var newIndex;
    if (this.state.selectionIndex === null) {
      if (delta == 1) {
        newIndex = 0;
      } else {
        newIndex = delta;
      }
    } else {
      newIndex = this.state.selectionIndex + delta;
    }
    if (newIndex < 0) {
      newIndex += this.props.options.length;
    } else if (newIndex >= this.props.options.length) {
      newIndex -= this.props.options.length;
    }
    var newSelection = this.getSelectionForIndex(newIndex);
    this.setState({selectionIndex: newIndex,
                   selection: newSelection});
  },

  navDown: function() {
    this._nav(1);
  },

  navUp: function() {
    this._nav(-1);
  }

});

module.exports = TypeaheadSelector;

},{"./option":7,"react/addons":"react/addons"}]},{},[3])(3)
});
});

require.register("renderjson", function(exports, require, module) {
// Copyright © 2013-2014 David Caldwell <david@porkrind.org>
//
// Permission to use, copy, modify, and/or distribute this software for any
// purpose with or without fee is hereby granted, provided that the above
// copyright notice and this permission notice appear in all copies.
//
// THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
// WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
// MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
// SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
// WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION
// OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN
// CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

// Usage
// -----
// The module exports one entry point, the `renderjson()` function. It takes in
// the JSON you want to render as a single argument and returns an HTML
// element.
//
// Options
// -------
// renderjson.set_icons("+", "-")
//   This Allows you to override the disclosure icons.
//
// renderjson.set_show_to_level(level)
//   Pass the number of levels to expand when rendering. The default is 0, which
//   starts with everything collapsed. As a special case, if level is the string
//   "all" then it will start with everything expanded.
//
// Theming
// -------
// The HTML output uses a number of classes so that you can theme it the way
// you'd like:
//     .disclosure    ("⊕", "⊖")
//     .syntax        (",", ":", "{", "}", "[", "]")
//     .string        (includes quotes)
//     .number
//     .boolean
//     .key           (object key)
//     .keyword       ("null", "undefined")
//     .object.syntax ("{", "}")
//     .array.syntax  ("[", "]")

var module;
(module||{}).exports = renderjson = (function() {
    var themetext = function(/* [class, text]+ */) {
        var spans = [];
        while (arguments.length)
            spans.push(append(span(Array.prototype.shift.call(arguments)),
                              text(Array.prototype.shift.call(arguments))));
        return spans;
    };
    var append = function(/* el, ... */) {
        var el = Array.prototype.shift.call(arguments);
        for (var a=0; a<arguments.length; a++)
            if (arguments[a].constructor == Array)
                append.apply(this, [el].concat(arguments[a]));
            else
                el.appendChild(arguments[a]);
        return el;
    };
    var prepend = function(el, child) {
        el.insertBefore(child, el.firstChild);
        return el;
    }
    var isempty = function(obj) { for (var k in obj) if (obj.hasOwnProperty(k)) return false;
                                  return true; }
    var text = function(txt) { return document.createTextNode(txt) };
    var div = function() { return document.createElement("div") };
    var span = function(classname) { var s = document.createElement("span");
                                     if (classname) s.className = classname;
                                     return s; };
    var A = function A(txt, classname, callback) { var a = document.createElement("a");
                                                   if (classname) a.className = classname;
                                                   a.appendChild(text(txt));
                                                   a.href = '#';
                                                   a.onclick = function() { callback(); return false; };
                                                   return a; };

    function _renderjson(json, indent, dont_indent, show_level) {
        var my_indent = dont_indent ? "" : indent;

        if (json === null) return themetext(null, my_indent, "keyword", "null");
        if (json === void 0) return themetext(null, my_indent, "keyword", "undefined");
        if (typeof(json) != "object") // Strings, numbers and bools
            return themetext(null, my_indent, typeof(json), JSON.stringify(json));

        var disclosure = function(open, close, type, builder) {
            var content;
            var empty = span(type);
            var show = function() { if (!content) append(empty.parentNode,
                                                         content = prepend(builder(),
                                                                           A(renderjson.hide, "disclosure",
                                                                             function() { content.style.display="none";
                                                                                          empty.style.display="inline"; } )));
                                    content.style.display="inline";
                                    empty.style.display="none"; };
            append(empty,
                   A(renderjson.show, "disclosure", show),
                   themetext(type+ " syntax", open),
                   A(" ... ", null, show),
                   themetext(type+ " syntax", close));

            var el = append(span(), text(my_indent.slice(0,-1)), empty);
            if (show_level > 0)
                show();
            return el;
        };

        if (json.constructor == Array) {
            if (json.length == 0) return themetext(null, my_indent, "array syntax", "[]");

            return disclosure("[", "]", "array", function () {
                var as = append(span("array"), themetext("array syntax", "[", null, "\n"));
                for (var i=0; i<json.length; i++)
                    append(as,
                           _renderjson(json[i], indent+"    ", false, show_level-1),
                           i != json.length-1 ? themetext("syntax", ",") : [],
                           text("\n"));
                append(as, themetext(null, indent, "array syntax", "]"));
                return as;
            });
        }

        // object
        if (isempty(json))
            return themetext(null, my_indent, "object syntax", "{}");

        return disclosure("{", "}", "object", function () {
            var os = append(span("object"), themetext("object syntax", "{", null, "\n"));
            for (var k in json) var last = k;
            for (var k in json)
                append(os, themetext(null, indent+"    ", "key", '"'+k+'"', "object syntax", ': '),
                       _renderjson(json[k], indent+"    ", true, show_level-1),
                       k != last ? themetext("syntax", ",") : [],
                       text("\n"));
            append(os, themetext(null, indent, "object syntax", "}"));
            return os;
        });
    }

    var renderjson = function renderjson(json)
    {
        var pre = append(document.createElement("pre"), _renderjson(json, "", false, renderjson.show_to_level));
        pre.className = "renderjson";
        return pre;
    }
    renderjson.set_icons = function(show, hide) { renderjson.show = show;
                                                  renderjson.hide = hide;
                                                  return renderjson; };
    renderjson.set_show_to_level = function(level) { renderjson.show_to_level = typeof level == "string" &&
                                                                                level.toLowerCase() === "all" ? Number.MAX_VALUE
                                                                                                              : level;
                                                      return renderjson; };
    // Backwards compatiblity. Use set_show_to_level() for new code.
    renderjson.set_show_by_default = function(show) { renderjson.show_to_level = show ? Number.MAX_VALUE : 0;
                                                      return renderjson; };
    renderjson.set_icons('⊕', '⊖');
    renderjson.set_show_by_default(false);
    return renderjson;
})();

});

require.register("routes", function(exports, require, module) {
var DataExplorer = require("table")
var SocialFeed = require('social_feed');
var UserDatasetTable = require("user_dataset_table")
var Connect = require("connect")
var NavBar = require("navbar")
var StatsPage = require("stats_page")
var SubscribePage = require("subscribe_page")
var PatronPage = require("patron_page")

var TabbedArea = ReactBootstrap.TabbedArea
var TabPane = ReactBootstrap.TabPane
var SplitButton = ReactBootstrap.SplitButton
var MenuItem= ReactBootstrap.SplitButton
var Login = require("login")
var Connect = require("connect")
var Signup = require("signup")
var Landing = require("mc_landing")
var LandingBrand = require("landing_brand")
var LandingCreator = require("landing_creator")
var Chat = require("chat")

var Route = ReactRouter.Route;
var RouteHandler = ReactRouter.RouteHandler;

var Nav = React.createClass({displayName: 'Nav',
  gotoHome: function() { location.href= "#" },
  gotoApproach: function() { location.href= "#/approach" },
  gotoWork: function() { location.href= "#/work" },
  gotoTeam: function() { location.href= "#/team" },
  gotoVentures: function() { location.href= "#/ventures" },

  render: function() {
    return (
      React.createElement("div", {className: "row"}, 
        React.createElement("h3", {style: {float:"left",marginTop:70,cursor:"pointer"}, onClick: this.gotoHome}, 
          React.createElement("img", {src: "images/pic_logo.png", style: {height:23,marginRight:5,marginTop:-3}}), 
          "Picobit"), 

        React.createElement("div", {style: {float:"right",marginTop:80,marginRight:50,fontSize:11,fontWeight:600,color:"#ccc"}}, 
          React.createElement("span", {style: {marginRight:20,display:"none",cursor:"pointer"}, onClick: this.gotoWork}, "WORK"), 
          React.createElement("span", {style: {display:"block",marginRight:20,display:"none",cursor:"pointer"}, onClick: this.gotoApproach}, "APPROACH"), 
          React.createElement("span", {style: {display:"block",marginRight:20,display:"none",cursor:"pointer"}, onClick: this.gotoTeam}, "TEAM"), 
          React.createElement("span", {style: {cursor:"pointer",display:"none",marginRight:20,cursor:"pointer"}, onClick: this.gotoVentures}, "VENTURES"), 
          React.createElement("a", {style: {display:"inline",marginRight:20,border:"3px solid #5898f1",color:"#5898f1",padding:5,borderRadius:5,cursor:"pointer",textDecoration:"none"}, 
            href: "mailto:someone@example.com"}, "CONTACT")
        )
      )
    )
  }
})

var Approach = React.createClass({displayName: 'Approach',
  render: function () {
    return (
      React.createElement("div", {className: "container"}, 
        React.createElement(Nav, null), 
        React.createElement("h3", null, "Approach")
      )
    )
  }
})

var Team = React.createClass({displayName: 'Team',
  render: function () {
    return (
      React.createElement("div", {className: "container"}, 
        React.createElement(Nav, null), 
        React.createElement("h3", null, "Approach")
      )
    )
  }
})

var Work = React.createClass({displayName: 'Work',
  render: function () {
    style = {
      boxShadow: "0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.24)",
      transition: "all 0.2s ease-in-out",
      textAlign:"center",
      paddingTop:80,
      width:200,
      height:200,
      display:"block"
    }
    return (
      React.createElement("div", {className: "container"}, 
        React.createElement(Nav, null), 
        React.createElement("div", {style: {textAlign:"center"}}, 
          React.createElement("br", null), 
          React.createElement("h3", null, "Selected Work"), 
          React.createElement("br", null), 
          React.createElement("div", {style: style}, 
            React.createElement("img", {style: {width:80}, src: "images/sage-logo.png"})
          ), 
          React.createElement("div", {style: {width:200,marginTop:20}}, 
            React.createElement("div", {style: {fontSize:12,fontWeight:800}}, "CASE STUDY #1"), 
            React.createElement("div", {style: {fontSize:32,fontWeight:200,fontFamily:"proxima-nova"}}, "Sage Care"), 
            React.createElement("div", {style: {fontSize:14,fontStyle:"italic",fontWeight:400,fontFamily:"garamond"}}, 
              "From zero to production ready app in app-store in 20 days."
            )
          )
        )
      )
    )
  }
})

var Team = React.createClass({displayName: 'Team',
  render: function () {
    return (
      React.createElement("div", {className: "container"}, 
        React.createElement(Nav, null), 
        React.createElement("h3", null, "Team")
      )
    )
  }
})


var About = React.createClass({displayName: 'About',
  render: function () {
    return (
      React.createElement("div", {className: "container"}, 
        React.createElement(Nav, null), 

        React.createElement("div", {className: "row", style: {textAlign:"center",fontSize:32,fontWeight:100,marginTop:50}}, 
        React.createElement("img", {src: "images/moon.png", style: {height:100,marginTop:100}}), 
        React.createElement("br", null), 

        React.createElement("div", {style: {float:"left",marginTop:70,width:"100%"}}, 
          "Hi! We are a startup studio based in Toronto, Canada.",  
          React.createElement("br", null), 
          "We help companies build products that thoughtfully combine",  
          React.createElement("br", null), 
          React.createElement("span", {style: {fontFamily:"garamond",fontStyle:"italic"}}, 
            "design and technology."
          )
          )
        ), 

        React.createElement("div", {style: {display:"none"}}, 
        React.createElement("hr", {style: {marginTop:100,marginBottom:100,width:300}}), 
        React.createElement("div", {className: "row", style: {fontSize:32,fontWeight:100}}, 
          "Build products that matter.", 
          React.createElement("div", {className: "col-md-offset-2 col-md-8"}, 
            React.createElement("br", null), 
            React.createElement("br", null), 
            React.createElement("br", null), 
            React.createElement("img", {src: "images/Group.png", style: {width:"100%"}}), 
            React.createElement("br", null), 
            React.createElement("br", null)
          )
        ), 

        React.createElement("hr", {style: {marginTop:100,marginBottom:100,width:300}}), 
        React.createElement("div", {className: "row", style: {fontSize:32,fontWeight:100}}, 
          "Yoyo"
        )
        ), 
        React.createElement("hr", {style: {marginTop:100,marginBottom:60,width:300}}), 
        React.createElement("div", {style: {textAlign:"center"}}, 
          React.createElement("img", {src: "images/pic_logo.png", style: {height:53,marginBottom:60}})
        )
      )
    )
  }
});

var Ventures = React.createClass({displayName: 'Ventures',
  render: function() {
    return (
      React.createElement("div", {className: "container"}, 
        React.createElement(Nav, null), 

        React.createElement("div", {className: "row", style: {textAlign:"center",fontSize:32,fontWeight:100}}, 
          React.createElement("div", {style: {marginTop:170}}, 
            React.createElement("img", {src: "images/ship.png", style: {height:70,marginTop:50}}), 
            React.createElement("br", null), 
            React.createElement("br", null), 
            "Pre-Seed Venture Fund", 
            React.createElement("div", {style: {fontSize:22,fontWeight:100,marginTop:50}}, 
              "We fund technical founders with tiny products, with a big vision."
            )
        )

        )

      )

    )
  }
})

var routes = (
  React.createElement(Route, null, 
      React.createElement(Route, {path: "", handler: About}), 
      React.createElement(Route, {path: "ventures", handler: Ventures}), 
      React.createElement(Route, {path: "approach", handler: Approach}), 
      React.createElement(Route, {path: "work", handler: Work}), 
      React.createElement(Route, {path: "team", handler: Team})
  )
);

module.exports = routes;

});

require.register("sankey", function(exports, require, module) {
d3.sankey = function() {
  var sankey = {},
      nodeWidth = 24,
      nodePadding = 8,
      size = [1, 1],
      nodes = [],
      links = [];

  sankey.nodeWidth = function(_) {
    if (!arguments.length) return nodeWidth;
    nodeWidth = +_;
    return sankey;
  };

  sankey.nodePadding = function(_) {
    if (!arguments.length) return nodePadding;
    nodePadding = +_;
    return sankey;
  };

  sankey.nodes = function(_) {
    if (!arguments.length) return nodes;
    nodes = _;
    return sankey;
  };

  sankey.links = function(_) {
    if (!arguments.length) return links;
    links = _;
    return sankey;
  };

  sankey.size = function(_) {
    if (!arguments.length) return size;
    size = _;
    return sankey;
  };

  sankey.layout = function(iterations) {
    computeNodeLinks();
    computeNodeValues();
    computeNodeBreadths();
    computeNodeDepths(iterations);
    computeLinkDepths();
    return sankey;
  };

  sankey.relayout = function() {
    computeLinkDepths();
    return sankey;
  };

  sankey.link = function() {
    var curvature = .5;

    function link(d) {
      var x0 = d.source.x + d.source.dx,
          x1 = d.target.x,
          xi = d3.interpolateNumber(x0, x1),
          x2 = xi(curvature),
          x3 = xi(1 - curvature),
          y0 = d.source.y + d.sy + d.dy / 2,
          y1 = d.target.y + d.ty + d.dy / 2;
      return "M" + x0 + "," + y0
           + "C" + x2 + "," + y0
           + " " + x3 + "," + y1
           + " " + x1 + "," + y1;
    }

    link.curvature = function(_) {
      if (!arguments.length) return curvature;
      curvature = +_;
      return link;
    };

    return link;
  };

  // Populate the sourceLinks and targetLinks for each node.
  // Also, if the source and target are not objects, assume they are indices.
  function computeNodeLinks() {
    nodes.forEach(function(node) {
      node.sourceLinks = [];
      node.targetLinks = [];
    });
    links.forEach(function(link) {
      var source = link.source,
          target = link.target;
      if (typeof source === "number") source = link.source = nodes[link.source];
      if (typeof target === "number") target = link.target = nodes[link.target];
      source.sourceLinks.push(link);
      target.targetLinks.push(link);
    });
  }

  // Compute the value (size) of each node by summing the associated links.
  function computeNodeValues() {
    nodes.forEach(function(node) {
      node.value = Math.max(
        d3.sum(node.sourceLinks, value),
        d3.sum(node.targetLinks, value)
      );
    });
  }

  // Iteratively assign the breadth (x-position) for each node.
  // Nodes are assigned the maximum breadth of incoming neighbors plus one;
  // nodes with no incoming links are assigned breadth zero, while
  // nodes with no outgoing links are assigned the maximum breadth.
  function computeNodeBreadths() {
    var remainingNodes = nodes,
        nextNodes,
        x = 0;

    while (remainingNodes.length) {
      nextNodes = [];
      remainingNodes.forEach(function(node) {
        node.x = x;
        node.dx = nodeWidth;
        node.sourceLinks.forEach(function(link) {
          if (nextNodes.indexOf(link.target) < 0) {
            nextNodes.push(link.target);
          }
        });
      });
      remainingNodes = nextNodes;
      ++x;
    }

    //
    moveSinksRight(x);
    scaleNodeBreadths((size[0] - nodeWidth) / (x - 1));
  }

  function moveSourcesRight() {
    nodes.forEach(function(node) {
      if (!node.targetLinks.length) {
        node.x = d3.min(node.sourceLinks, function(d) { return d.target.x; }) - 1;
      }
    });
  }

  function moveSinksRight(x) {
    nodes.forEach(function(node) {
      if (!node.sourceLinks.length) {
        node.x = x - 1;
      }
    });
  }

  function scaleNodeBreadths(kx) {
    nodes.forEach(function(node) {
      node.x *= kx;
    });
  }

  function computeNodeDepths(iterations) {
    var nodesByBreadth = d3.nest()
        .key(function(d) { return d.x; })
        .sortKeys(d3.ascending)
        .entries(nodes)
        .map(function(d) { return d.values; });

    //
    initializeNodeDepth();
    resolveCollisions();
    for (var alpha = 1; iterations > 0; --iterations) {
      relaxRightToLeft(alpha *= .99);
      resolveCollisions();
      relaxLeftToRight(alpha);
      resolveCollisions();
    }

    function initializeNodeDepth() {
      var ky = d3.min(nodesByBreadth, function(nodes) {
        return (size[1] - (nodes.length - 1) * nodePadding) / d3.sum(nodes, value);
      });

      nodesByBreadth.forEach(function(nodes) {
        nodes.forEach(function(node, i) {
          node.y = i;
          node.dy = node.value * ky;
        });
      });

      links.forEach(function(link) {
        link.dy = link.value * ky;
      });
    }

    function relaxLeftToRight(alpha) {
      nodesByBreadth.forEach(function(nodes, breadth) {
        nodes.forEach(function(node) {
          if (node.targetLinks.length) {
            var y = d3.sum(node.targetLinks, weightedSource) / d3.sum(node.targetLinks, value);
            node.y += (y - center(node)) * alpha;
          }
        });
      });

      function weightedSource(link) {
        return center(link.source) * link.value;
      }
    }

    function relaxRightToLeft(alpha) {
      nodesByBreadth.slice().reverse().forEach(function(nodes) {
        nodes.forEach(function(node) {
          if (node.sourceLinks.length) {
            var y = d3.sum(node.sourceLinks, weightedTarget) / d3.sum(node.sourceLinks, value);
            node.y += (y - center(node)) * alpha;
          }
        });
      });

      function weightedTarget(link) {
        return center(link.target) * link.value;
      }
    }

    function resolveCollisions() {
      nodesByBreadth.forEach(function(nodes) {
        var node,
            dy,
            y0 = 0,
            n = nodes.length,
            i;

        // Push any overlapping nodes down.
        nodes.sort(ascendingDepth);
        for (i = 0; i < n; ++i) {
          node = nodes[i];
          dy = y0 - node.y;
          if (dy > 0) node.y += dy;
          y0 = node.y + node.dy + nodePadding;
        }

        // If the bottommost node goes outside the bounds, push it back up.
        dy = y0 - nodePadding - size[1];
        if (dy > 0) {
          y0 = node.y -= dy;

          // Push any overlapping nodes back up.
          for (i = n - 2; i >= 0; --i) {
            node = nodes[i];
            dy = node.y + node.dy + nodePadding - y0;
            if (dy > 0) node.y -= dy;
            y0 = node.y;
          }
        }
      });
    }

    function ascendingDepth(a, b) {
      return a.y - b.y;
    }
  }

  function computeLinkDepths() {
    nodes.forEach(function(node) {
      node.sourceLinks.sort(ascendingTargetDepth);
      node.targetLinks.sort(ascendingSourceDepth);
    });
    nodes.forEach(function(node) {
      var sy = 0, ty = 0;
      node.sourceLinks.forEach(function(link) {
        link.sy = sy;
        sy += link.dy;
      });
      node.targetLinks.forEach(function(link) {
        link.ty = ty;
        ty += link.dy;
      });
    });

    function ascendingSourceDepth(a, b) {
      return a.source.y - b.source.y;
    }

    function ascendingTargetDepth(a, b) {
      return a.target.y - b.target.y;
    }
  }

  function center(node) {
    return node.y + node.dy / 2;
  }

  function value(link) {
    return link.value;
  }

  return sankey;
};

});

require.register("search_bar", function(exports, require, module) {
//var TagsInput = require('react-tagsinput');
//var TagsInput = require('react-tageditor');
          //<TagsInput ref='tags' />

var SearchBar = React.createClass({displayName: 'SearchBar',
  render: function() {
    return (
      React.createElement("div", null, 
        React.createElement("div", null, 
          React.createElement(TagEditor, {tags: [], delimiters: [",",13], placeholder: "Enter search..."})
        )
      )
    )
  }
})

module.exports = SearchBar

});

;require.register("signup", function(exports, require, module) {
var Login = React.createClass({displayName: 'Login',
  loginUser: function() {
    data = {}
    $.ajax({
      url:location.origin+ "/login",
      data: {},
      dataType:"json",
      // auth token: ""
      success: function(res) {
        console.log(res)
        location.currentUser(res.token)
        // location.href="/#/signals"
      },
      error: function(err) {
        console.log(err)
      }
    })
  },

  componentDidMount: function() {
    $('.login-form .form-control').floatlabel({
      labelClass:"floatingLabel",
      labelEndTop :"5px"
    });
  },

  render: function() {
    return (
      React.createElement("div", {style: {height:"100%"}, className: "coral-purple"}, 
      React.createElement("div", {style: {width:320,textAlign:"center",paddingTop:120}, className: "col-md-2 col-md-offset-4  login-form"}, 
        React.createElement("i", {className: "fa fa-lightbulb-o", style: {fontSize:60,color:"white"}}), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("h5", {style: {color:"white",fontWeight:800}}, " SUPPORT THE MAKERS YOU LOVE "), 
          React.createElement("br", null), 
        React.createElement("input", {type: "text", className: "form-control input-lg", style: {fontSize:16, marginRight:"auto",marginLeft:"auto",marginTop:30,width:300,borderRadius:2}, placeholder: "EMAIL"}), 
        React.createElement("input", {className: "form-control input-lg", style: {fontSize:16, marginTop:10,marginLeft:"auto",marginRight:"auto",width:300,borderRadius:2}, placeholder: "PASSWORD", type: "password"}), 
        React.createElement("input", {className: "form-control input-lg", style: {fontSize:16, marginTop:10,marginLeft:"auto",marginRight:"auto",width:300,borderRadius:2}, placeholder: "CONFIRM PASSWORD", type: "password"}), 
        React.createElement("br", null), 
        React.createElement("a", {className: "btn btn-lg btn-primary", 
          onClick: this.loginUser, 
          style: {marginTop:10,width:300, fontSize:16}}, "SIGN UP")
      )
    )
    )
  }
})

module.exports = Login

});

;require.register("social_feed", function(exports, require, module) {
var YoutubeRow = require("youtube_row")
var InstagramRow = require("instagram_row")
var NavBar = require("navbar")

var SocialFeed = React.createClass({displayName: 'SocialFeed',
  render: function() {
    console.log(this.props)
    return (
      React.createElement("div", {style: {height:'100%'}}, 
      React.createElement(NavBar, null), 
        React.createElement(SideBar, null), 
        React.createElement(ContentArea, {params: this.props.params})
      )
    )
  }
})

var SideBar = React.createClass({displayName: 'SideBar',
  gotoYoutube: function() {
    location.href = "#/network/youtube/1"
  },

  gotoInstagram: function() {
    location.href = "#/network/instagram/1"
  },

  render: function() {
    return (
  React.createElement("div", {className: "sidebar"}, 
    React.createElement("div", {style: {marginTop:20}}, 
      React.createElement("h6", {style: {fontWeight:"bold",marginBottom:1}}, 
        React.createElement("img", {src: "images/social_spark_dark_logo.png", className: "", style: {height:20}}), 
        "TRENDING "), 
      React.createElement("h6", {style: {fontWeight:"bold",marginTop:5}}, 
        React.createElement("i", {className: "fa fa-bars", style: {paddingLeft:2}}), "  LISTS ")
    ), 
    React.createElement("div", null, 
      React.createElement("h6", {style: {fontWeight:"bold"}}, 
        React.createElement("i", {className: "fa fa-calendar", style: {paddingLeft:2}}), "  EVENTS"
      )
    ), 
    React.createElement("div", null, 
      React.createElement("h6", {style: {fontWeight:"bold"}}, 
        React.createElement("i", {className: "fa fa-star", style: {paddingLeft:2}}), "  BOOKINGS"
      )
    ), 
    React.createElement("div", null, 
      React.createElement("h6", {style: {fontWeight:"bold"}}, 
        React.createElement("i", {className: "fa fa-compass", style: {paddingLeft:2}}), " " + ' ' +
        "EXPLORE"
      ), 
      React.createElement("div", {style: {paddingLeft:20,marginTop:10}}, 
        React.createElement("h6", {style: {display:"none"}}, 
          React.createElement("i", {className: "fa fa-facebook"}), " Facebook"), 
        React.createElement("h6", null, React.createElement("i", {className: "fa fa-twitter"}), " Twitter"), 
        React.createElement("h6", null, React.createElement("i", {className: "fa fa-soundcloud"}), " Soundcloud"), 
        React.createElement("h6", {onClick: this.gotoYoutube, style: {cursor:"pointer"}}, 
            React.createElement("i", {className: "fa fa-youtube"}), " Youtube"), 
        React.createElement("h6", {onClick: this.gotoInstagram, style: {cursor:"pointer"}}, 
            React.createElement("i", {className: "fa fa-instagram"}), " Instagram"), 
        React.createElement("h6", null, React.createElement("i", {className: "fa fa-pinterest"}), " Pinterest"), 
        React.createElement("h6", null, React.createElement("i", {className: "fa fa-vine"}), " Vine"), 
        React.createElement("h6", {style: {display:"none"}}, 
          React.createElement("i", {className: "fa fa-twitch"}), " Twitch"), 
        React.createElement("h6", {style: {display:"none"}}, 
          React.createElement("i", {className: "fa fa-pinterest"}), " Pinterest")
      )
    ), 

    React.createElement("div", null, 
      React.createElement("h6", {style: {fontWeight:"bold"}}, 
        React.createElement("i", {className: "fa fa-ellipsis-hh", style: {paddingLeft:2}}), " " + ' ' +
        "Categories"
      ), 
      React.createElement("div", {style: {paddingLeft:20,marginTop:10}}, 
        React.createElement("h6", null, React.createElement("i", {className: "fa fa-v"}), " Music"), 
        React.createElement("h6", null, React.createElement("i", {className: "fa fa-v"}), " Comedy"), 
        React.createElement("h6", null, React.createElement("i", {className: "fa fa-v"}), " ", "Film & Entertainment"), 
        React.createElement("h6", null, React.createElement("i", {className: "fa fa-v"}), " Gaming"), 
        React.createElement("h6", null, React.createElement("i", {className: "fa fa-v"}), " ", "Beauty & Fashion"), 
        React.createElement("h6", null, React.createElement("i", {className: "fa fa-v"}), " Automotive"), 
        React.createElement("h6", null, React.createElement("i", {className: "fa fa-v"}), " Sports"), 
        React.createElement("h6", null, React.createElement("i", {className: "fa fa-v"}), " ", "How-to & DIY"), 
        React.createElement("h6", null, React.createElement("i", {className: "fa fa-v"}), " ", "Science & Education"), 
        React.createElement("h6", null, React.createElement("i", {className: "fa fa-v"}), " ", "Lifestyle")
      )
    )
  )
    )
  }
})


var ContentArea = React.createClass({displayName: 'ContentArea',
  getInitialState: function() {
    return {
      page: 1,
      profiles: []
    }
  },

  componentDidMount: function () {
    var _this = this;
    params = this.props.params
    $.ajax({
      url: location.origin + "/network/"+params.network+"/" + params.page,
      dataType:"json",
      success: function(res) {
        console.log(res)
        _this.setState({profiles: res})
      }, 
      error: function(err) {
        console.log(err)
      }
    })
  },

  render: function() {
    var _this = this;
    rows = _.map(this.state.profiles, function(row) {
      if(_this.props.params.network = "youtube")
        return (React.createElement(YoutubeRow, {row: row}) )
      else if(_this.props.params.network = "instagram")
        return (React.createElement(InstagramRow, {row: row}) )
    })

    return (
      React.createElement("div", {className: "container", style: {paddingTop:10,fontFamily:"proxima-nova"}}, 
        React.createElement("div", {className: "row", style: {height:500,overflow:"auto"}}, 
          React.createElement("div", {className: "col-md-10"}, 
            React.createElement("table", {className: ""}, 
              React.createElement("thead", null, 
                React.createElement("th", null), 
                React.createElement("th", null, "Name"), 
                React.createElement("th", null, "Profile"), 
                React.createElement("th", null, "Subscribers"), 
                React.createElement("th", null, "Views"), 
                React.createElement("th", null
                )
              ), 
              React.createElement("tbody", null, 
                rows
              )
            )
          )
        ), 

        React.createElement("nav", {style: {textAlign:"center"}}, 
          React.createElement("ul", {className: "pagination"}, 
            React.createElement("li", null, 
              React.createElement("a", {href: "#", 'aria-label': "Previous"}, 
                React.createElement("span", {'aria-hidden': "true"}, "«")
              )
            ), 
            React.createElement("li", null, React.createElement("a", {href: "#"}, "1")), 
            React.createElement("li", null, React.createElement("a", {href: "#"}, "2")), 
            React.createElement("li", null, React.createElement("a", {href: "#"}, "3")), 
            React.createElement("li", null, React.createElement("a", {href: "#"}, "4")), 
            React.createElement("li", null, React.createElement("a", {href: "#"}, "5")), 
            React.createElement("li", null, 
              React.createElement("a", {href: "#", 'aria-label': "Next"}, 
                React.createElement("span", {'aria-hidden': "true"}, "»")
              )
            )
          )
        )
      )
    )
  }
})

var OldContentArea = React.createClass({displayName: 'OldContentArea',
  render: function() {
    return (
      React.createElement("div", {className: "container", style: {paddingTop:10,fontFamily:"proxima-nova"}}, 
        React.createElement("div", {className: "row"}, 
          React.createElement("div", {className: "col-md-10"}, 
      React.createElement("div", {className: "content-area"}, 
        React.createElement("ol", {className: "breadcrumb"}, 
          React.createElement("li", null, React.createElement("a", {href: "#"}, "Home")), 
          React.createElement("li", null, React.createElement("a", {href: "#"}, "Library")), 
          React.createElement("li", {className: "active"}, "Data")
        ), 
  React.createElement("div", {className: "row"}, 
    React.createElement("div", {className: "col-md-3"}, 
    React.createElement("div", {className: "panel panel-default"}, 
      React.createElement("div", {className: "panel-body"}, 
        "Panel content"
      ), 
      React.createElement("div", {className: "panel-footer"}, "Panel heading without title")
    )
    ), 
    React.createElement("div", {className: "col-md-3"}, 
    React.createElement("div", {className: "panel panel-default"}, 
      React.createElement("div", {className: "panel-body"}, 
        "Panel content"
      ), 
      React.createElement("div", {className: "panel-footer"}, "Panel heading without title")
    )
    ), 
    React.createElement("div", {className: "col-md-3"}, 
    React.createElement("div", {className: "panel panel-default"}, 
      React.createElement("div", {className: "panel-body"}, 
        "Panel content"
      ), 
      React.createElement("div", {className: "panel-footer"}, "Panel heading without title")
    )
    ), 
    React.createElement("div", {className: "col-md-3"}, 
    React.createElement("div", {className: "panel panel-default"}, 
      React.createElement("div", {className: "panel-body"}, 
        "Panel content"
      ), 
      React.createElement("div", {className: "panel-footer"}, "Panel heading without title")
    )
    )
), 
        

        React.createElement("nav", {style: {textAlign:"center"}}, 
          React.createElement("ul", {className: "pagination"}, 
            React.createElement("li", null, 
              React.createElement("a", {href: "#", 'aria-label': "Previous"}, 
                React.createElement("span", {'aria-hidden': "true"}, "«")
              )
            ), 
            React.createElement("li", null, React.createElement("a", {href: "#"}, "1")), 
            React.createElement("li", null, React.createElement("a", {href: "#"}, "2")), 
            React.createElement("li", null, React.createElement("a", {href: "#"}, "3")), 
            React.createElement("li", null, React.createElement("a", {href: "#"}, "4")), 
            React.createElement("li", null, React.createElement("a", {href: "#"}, "5")), 
            React.createElement("li", null, 
              React.createElement("a", {href: "#", 'aria-label': "Next"}, 
                React.createElement("span", {'aria-hidden': "true"}, "»")
              )
            )
          )
        )
      )
          )
        )

      )
    )
  }
})

module.exports = SocialFeed

});

;require.register("stats_page", function(exports, require, module) {
var NavBar = require("navbar")
var ListGroup = ReactBootstrap.ListGroup
var ListGroupItem = ReactBootstrap.ListGroupItem
var Pagination = ReactBootstrap.Pagination

var StatsPage = React.createClass({displayName: 'StatsPage',
  render: function() {
    rows = _.map(_.range(10), function(i) {
      return (
        React.createElement("tr", null, 
          React.createElement("td", null, " ", React.createElement("img", {src: "images/user.png", style: {height:50,width:50}}), " "), 
          React.createElement("td", null, " Brad Pitt "), 
          React.createElement("td", null, " @bradpitt "), 
          React.createElement("td", null, " 423K "), 
          React.createElement("td", null, " brad@bradpitt.com ")
        )
      )
    })
    return (
      React.createElement("div", null, 
        React.createElement(NavBar, null), 
        React.createElement("div", null, 
        React.createElement("div", {className: "col-md-6"}, 
          React.createElement("br", null), 
          React.createElement("div", null, 
          React.createElement("div", {className: "panel panel-default"}, 
            React.createElement("div", {className: "panel-heading"}, "Followers Emails (999)", 
              
            
              React.createElement("span", {style: {float:"right"}, 
                className: "label label-success"}, "PREMIUM")
            ), 
              React.createElement("div", {style: {}}, 
                React.createElement("div", {className: "upgrade-overlay", style: {}}, 
                  React.createElement("a", {href: "javascript:", 
                      className: "btn btn-success btn-lg", 
                      style: {marginTop:200,marginLeft:200}}, 
                    "UPGRADE TO SEE ALL THE EMAILS")
                ), 
                React.createElement("table", {className: "table table-hover"}, 
                  React.createElement("thead", null, 
                    React.createElement("th", null), 
                    React.createElement("th", null, "Name"), 
                    React.createElement("th", null, "Account"), 
                    React.createElement("th", null, "Followers"), 
                    React.createElement("th", null, "Email")
                  ), 
                  React.createElement("tbody", null, 
                    rows
                  )
                )
              ), 
            React.createElement("div", {className: "panel-footer"}, 
              React.createElement(PaginationAdvanced, null)
            )
          )
          )

        ), 
        React.createElement("div", {className: "col-md-3"}, 
          React.createElement("br", null), 
          React.createElement("div", {className: "panel panel-default"}, 
            React.createElement("div", {className: "panel-heading"}, "Most Popular Followers"), 
              React.createElement(ListGroup, null, 
                React.createElement(ListGroupItem, null, "Item 1"), 
                React.createElement(ListGroupItem, null, "Item 2"), 
                React.createElement(ListGroupItem, null, "...")
              ), 
            React.createElement("div", {className: "panel-footer"}, 
              React.createElement(PaginationAdvanced, null)
            )
          ), 
          React.createElement("br", null), 
          React.createElement("div", {className: "panel panel-default"}, 
            React.createElement("div", {className: "panel-heading"}, "Most Popular Followers"), 
              React.createElement(ListGroup, null, 
                React.createElement(ListGroupItem, null, "Item 1"), 
                React.createElement(ListGroupItem, null, "Item 2"), 
                React.createElement(ListGroupItem, null, "...")
              ), 
            React.createElement("div", {className: "panel-footer"}, 
              React.createElement(PaginationAdvanced, null)
            )
          )

        ), 
        React.createElement("div", {className: "col-md-3"}, 
          React.createElement("br", null), 
          React.createElement("div", {className: "panel panel-default"}, 
            React.createElement("div", {className: "panel-heading"}, "Most Popular Followers"), 
            React.createElement("div", {className: "panel-body"}

            )
          ), 
          React.createElement("br", null), 
          React.createElement("br", null), 
          React.createElement("div", {className: "panel panel-default"}, 
            React.createElement("div", {className: "panel-heading"}, "Most Popular Followers"), 
              React.createElement(ListGroup, null, 
                React.createElement(ListGroupItem, null, "Item 1"), 
                React.createElement(ListGroupItem, null, "Item 2"), 
                React.createElement(ListGroupItem, null, "...")
              ), 
            React.createElement("div", {className: "panel-footer"}, 
              React.createElement(PaginationAdvanced, null)
            )
          )
        )
      )
      )
    )
  }
})

const PaginationAdvanced = React.createClass({displayName: 'PaginationAdvanced',
  getInitialState:function() {
    return {
      activePage: 1
    };
  },

  handleSelect:function(event, selectedEvent) {
    this.setState({
      activePage: selectedEvent.eventKey
    });
  },

  render:function() {
    return (
      React.createElement(Pagination, {
        prev: true, 
        next: true, 
        first: true, 
        last: true, 
        ellipsis: true, 
        items: 20, 
        maxButtons: 2, 
        activePage: this.state.activePage, 
        onSelect: this.handleSelect})
    );
  }
});


module.exports = StatsPage

});

;require.register("subscribe_page", function(exports, require, module) {
var NavBar = require("navbar")

var SubscribePage = React.createClass({displayName: 'SubscribePage',
  render: function() {
    return (
      React.createElement("div", null, 
        React.createElement(NavBar, null)
      )
    )
  }
})

module.exports = SubscribePage

});

;require.register("summernote.min", function(exports, require, module) {
!function(a){"function"==typeof define&&define.amd?define(["jquery"],a):a(window.jQuery)}(function(a){"function"!=typeof Array.prototype.reduce&&(Array.prototype.reduce=function(a,b){var c,d,e=this.length>>>0,f=!1;for(1<arguments.length&&(d=b,f=!0),c=0;e>c;++c)this.hasOwnProperty(c)&&(f?d=a(d,this[c],c,this):(d=this[c],f=!0));if(!f)throw new TypeError("Reduce of empty array with no initial value");return d});var b,c="function"==typeof define&&define.amd,d=function(b){var c="Comic Sans MS"===b?"Courier New":"Comic Sans MS",d=a("<div>").css({position:"absolute",left:"-9999px",top:"-9999px",fontSize:"200px"}).text("mmmmmmmmmwwwwwww").appendTo(document.body),e=d.css("fontFamily",c).width(),f=d.css("fontFamily",b+","+c).width();return d.remove(),e!==f},e={isMac:navigator.appVersion.indexOf("Mac")>-1,isMSIE:navigator.userAgent.indexOf("MSIE")>-1||navigator.userAgent.indexOf("Trident")>-1,isFF:navigator.userAgent.indexOf("Firefox")>-1,jqueryVersion:parseFloat(a.fn.jquery),isSupportAmd:c,hasCodeMirror:c?require.specified("CodeMirror"):!!window.CodeMirror,isFontInstalled:d,isW3CRangeSupport:!!document.createRange},f=function(){var b=function(a){return function(b){return a===b}},c=function(a,b){return a===b},d=function(){return!0},e=function(){return!1},f=function(a){return function(){return!a.apply(a,arguments)}},g=function(a){return a},h=0,i=function(a){var b=++h+"";return a?a+b:b},j=function(b){var c=a(document);return{top:b.top+c.scrollTop(),left:b.left+c.scrollLeft(),width:b.right-b.left,height:b.bottom-b.top}},k=function(a){var b={};for(var c in a)a.hasOwnProperty(c)&&(b[a[c]]=c);return b};return{eq:b,eq2:c,ok:d,fail:e,not:f,self:g,uniqueId:i,rect2bnd:j,invertObject:k}}(),g=function(){var a=function(a){return a[0]},b=function(a){return a[a.length-1]},c=function(a){return a.slice(0,a.length-1)},d=function(a){return a.slice(1)},e=function(a,b){var c=a.indexOf(b);return-1===c?null:a[c+1]},g=function(a,b){var c=a.indexOf(b);return-1===c?null:a[c-1]},h=function(a,b){for(var c=0,d=a.length;d>c;c++)if(!b(a[c]))return!1;return!0},i=function(a,b){return b=b||f.self,a.reduce(function(a,c){return a+b(c)},0)},j=function(a){for(var b=[],c=-1,d=a.length;++c<d;)b[c]=a[c];return b},k=function(c,e){if(!c.length)return[];var f=d(c);return f.reduce(function(a,c){var d=b(a);return e(b(d),c)?d[d.length]=c:a[a.length]=[c],a},[[a(c)]])},l=function(a){for(var b=[],c=0,d=a.length;d>c;c++)a[c]&&b.push(a[c]);return b},m=function(a){for(var b=[],c=0,d=a.length;d>c;c++)-1===b.indexOf(a[c])&&b.push(a[c]);return b};return{head:a,last:b,initial:c,tail:d,prev:g,next:e,all:h,sum:i,from:j,clusterBy:k,compact:l,unique:m}}(),h=String.fromCharCode(160),i="﻿",j=function(){var b=function(b){return b&&a(b).hasClass("note-editable")},c=function(b){return b&&a(b).hasClass("note-control-sizing")},d=function(b){var c;if(b.hasClass("note-air-editor")){var d=g.last(b.attr("id").split("-"));return c=function(b){return function(){return a(b+d)}},{editor:function(){return b},editable:function(){return b},popover:c("#note-popover-"),handle:c("#note-handle-"),dialog:c("#note-dialog-")}}return c=function(a){return function(){return b.find(a)}},{editor:function(){return b},dropzone:c(".note-dropzone"),toolbar:c(".note-toolbar"),editable:c(".note-editable"),codable:c(".note-codable"),statusbar:c(".note-statusbar"),popover:c(".note-popover"),handle:c(".note-handle"),dialog:c(".note-dialog")}},k=function(a){return a=a.toUpperCase(),function(b){return b&&b.nodeName.toUpperCase()===a}},l=function(a){return a&&3===a.nodeType},m=function(a){return a&&/^BR|^IMG|^HR/.test(a.nodeName.toUpperCase())},n=function(a){return b(a)?!1:a&&/^DIV|^P|^LI|^H[1-7]/.test(a.nodeName.toUpperCase())},o=function(a){return a&&/^UL|^OL/.test(a.nodeName.toUpperCase())},p=function(a){return a&&/^TD|^TH/.test(a.nodeName.toUpperCase())},q=function(a){return p(a)||b(a)},r=function(a){return j.isText(a)&&q(a.parentNode)},s=e.isMSIE?"&nbsp;":"<br>",t=function(a){m(a)||E(a)||(a.innerHTML=s)},u=function(a,c){for(;a;){if(c(a))return a;if(b(a))break;a=a.parentNode}return null},v=function(a,b){b=b||f.fail;var c=[];return u(a,function(a){return c.push(a),b(a)}),c},w=function(b,c){for(var d=v(b),e=c;e;e=e.parentNode)if(a.inArray(e,d)>-1)return e;return null},x=function(a,b){var c=[],d=!1,e=!1;return function f(g){if(g){if(g===a&&(d=!0),d&&!e&&c.push(g),g===b)return void(e=!0);for(var h=0,i=g.childNodes.length;i>h;h++)f(g.childNodes[h])}}(w(a,b)),c},y=function(a,b){b=b||f.fail;for(var c=[];a&&!b(a);)c.push(a),a=a.previousSibling;return c},z=function(a,b){b=b||f.fail;for(var c=[];a&&!b(a);)c.push(a),a=a.nextSibling;return c},A=function(a,b){var c=[];return b=b||f.ok,function d(e){a!==e&&b(e)&&c.push(e);for(var f=0,g=e.childNodes.length;g>f;f++)d(e.childNodes[f])}(a),c},B=function(b,c){var d=b.parentNode,e=a("<"+c+">")[0];return d.insertBefore(e,b),e.appendChild(b),e},C=function(a,b){var c=b.nextSibling,d=b.parentNode;return c?d.insertBefore(a,c):d.appendChild(a),a},D=function(b,c){return a.each(c,function(a,c){b.appendChild(c)}),b},E=function(a){return l(a)?a.nodeValue.length:a.childNodes.length},F=function(a){return 0===a.offset},G=function(a){return a.offset===E(a.node)},H=function(a){return 0===a.offset||G(a)},I=function(a,b){for(;a&&a!==b;){if(J(a)!==E(a.parentNode)-1)return!1;a=a.parentNode}return!0},J=function(a){for(var b=0;a=a.previousSibling;)b+=1;return b},K=function(a){return a&&a.childNodes&&a.childNodes.length},L=function(a,c){var d,e;if(0===a.offset){if(b(a.node))return null;d=a.node.parentNode,e=J(d)}else K(a.node)?(d=a.node.childNodes[e-1],e=E(d)):(d=d,e=c?0:a.offset-1);return{node:d,offset:e}},M=function(a,c){var d,e;if(E(a.node)===a.offset){if(b(a.node))return null;d=a.node.parentNode,e=J(a.node)+1}else K(a.node)?(d=a.node.childNodes[a.offset],e=0):(d=a.node,e=c?E(a.node):a.offset+1);return{node:d,offset:e}},N=function(a,b){return a.node===b.node&&a.offset===b.offset},O=function(b,c){var d=g.initial(v(c,f.eq(b)));return a.map(d,J).reverse()},P=function(a,b){for(var c=a,d=0,e=b.length;e>d;d++)c=c.childNodes[b[d]];return c},Q=function(a){if(l(a.node))return F(a)?a.node:G(a)?a.node.nextSibling:a.node.splitText(a.offset);var b=a.node.childNodes[a.offset],c=C(a.node.cloneNode(!1),a.node);return D(c,z(b)),t(a.node),t(c),c},R=function(a,b){var c=v(b.node,f.eq(a));return c.length?1===c.length?Q(b):c.reduce(function(a,c){var d=C(c.cloneNode(!1),c);return a===b.node&&(a=Q(b)),D(d,z(a)),t(c),t(d),d}):null},S=function(a){return document.createTextNode(a)},T=function(a,b){if(a&&a.parentNode){if(a.removeNode)return a.removeNode(b);var c=a.parentNode;if(!b){var d,e,f=[];for(d=0,e=a.childNodes.length;e>d;d++)f.push(a.childNodes[d]);for(d=0,e=f.length;e>d;d++)c.insertBefore(f[d],a)}c.removeChild(a)}},U=function(a){return j.isTextarea(a[0])?a.val():a.html()};return{NBSP_CHAR:h,ZERO_WIDTH_NBSP_CHAR:i,blank:s,emptyPara:"<p>"+s+"</p>",isEditable:b,isControlSizing:c,buildLayoutInfo:d,isText:l,isBodyText:r,isPara:n,isList:o,isTable:k("TABLE"),isCell:p,isBodyContainer:q,isAnchor:k("A"),isDiv:k("DIV"),isLi:k("LI"),isSpan:k("SPAN"),isB:k("B"),isU:k("U"),isS:k("S"),isI:k("I"),isImg:k("IMG"),isTextarea:k("TEXTAREA"),length:length,isRightEdgePoint:G,isEdgePoint:H,isRightEdgeOf:I,prevPoint:L,nextPoint:M,isSamePoint:N,ancestor:u,listAncestor:v,listNext:z,listPrev:y,listDescendant:A,commonAncestor:w,listBetween:x,wrap:B,insertAfter:C,position:J,makeOffsetPath:O,fromOffsetPath:P,splitTree:R,createText:S,remove:T,html:U}}(),k={version:"0.5.5",options:{width:null,height:null,minHeight:null,maxHeight:null,focus:!1,tabsize:4,styleWithSpan:!0,disableLinkTarget:!1,disableDragAndDrop:!1,disableResizeEditor:!1,codemirror:{mode:"text/html",htmlMode:!0,lineNumbers:!0,autoFormatOnStart:!1},lang:"en-US",direction:null,toolbar:[["style",["style"]],["font",["bold","italic","underline","superscript","subscript","strikethrough","clear"]],["fontname",["fontname"]],["color",["color"]],["para",["ul","ol","paragraph"]],["height",["height"]],["table",["table"]],["insert",["link","picture","video","hr"]],["view",["fullscreen","codeview"]],["help",["help"]]],airMode:!1,airPopover:[["color",["color"]],["font",["bold","underline","clear"]],["para",["ul","paragraph"]],["table",["table"]],["insert",["link","picture"]]],styleTags:["p","blockquote","pre","h1","h2","h3","h4","h5","h6"],defaultFontName:"Helvetica Neue",fontNames:["Arial","Arial Black","Comic Sans MS","Courier New","Helvetica Neue","Impact","Lucida Grande","Tahoma","Times New Roman","Verdana"],colors:[["#000000","#424242","#636363","#9C9C94","#CEC6CE","#EFEFEF","#F7F7F7","#FFFFFF"],["#FF0000","#FF9C00","#FFFF00","#00FF00","#00FFFF","#0000FF","#9C00FF","#FF00FF"],["#F7C6CE","#FFE7CE","#FFEFC6","#D6EFD6","#CEDEE7","#CEE7F7","#D6D6E7","#E7D6DE"],["#E79C9C","#FFC69C","#FFE79C","#B5D6A5","#A5C6CE","#9CC6EF","#B5A5D6","#D6A5BD"],["#E76363","#F7AD6B","#FFD663","#94BD7B","#73A5AD","#6BADDE","#8C7BC6","#C67BA5"],["#CE0000","#E79439","#EFC631","#6BA54A","#4A7B8C","#3984C6","#634AA5","#A54A7B"],["#9C0000","#B56308","#BD9400","#397B21","#104A5A","#085294","#311873","#731842"],["#630000","#7B3900","#846300","#295218","#083139","#003163","#21104A","#4A1031"]],fontSizes:["8","9","10","11","12","14","18","24","36"],lineHeights:["1.0","1.2","1.4","1.5","1.6","1.8","2.0","3.0"],insertTableMaxSize:{col:10,row:10},oninit:null,onfocus:null,onblur:null,onenter:null,onkeyup:null,onkeydown:null,onImageUpload:null,onImageUploadError:null,onToolbarClick:null,onCreateLink:function(a){return-1!==a.indexOf("@")&&-1===a.indexOf(":")?a="mailto:"+a:-1===a.indexOf("://")&&(a="http://"+a),a},keyMap:{pc:{ENTER:"insertParagraph","CTRL+Z":"undo","CTRL+Y":"redo",TAB:"tab","SHIFT+TAB":"untab","CTRL+B":"bold","CTRL+I":"italic","CTRL+U":"underline","CTRL+SHIFT+S":"strikethrough","CTRL+BACKSLASH":"removeFormat","CTRL+SHIFT+L":"justifyLeft","CTRL+SHIFT+E":"justifyCenter","CTRL+SHIFT+R":"justifyRight","CTRL+SHIFT+J":"justifyFull","CTRL+SHIFT+NUM7":"insertUnorderedList","CTRL+SHIFT+NUM8":"insertOrderedList","CTRL+LEFTBRACKET":"outdent","CTRL+RIGHTBRACKET":"indent","CTRL+NUM0":"formatPara","CTRL+NUM1":"formatH1","CTRL+NUM2":"formatH2","CTRL+NUM3":"formatH3","CTRL+NUM4":"formatH4","CTRL+NUM5":"formatH5","CTRL+NUM6":"formatH6","CTRL+ENTER":"insertHorizontalRule","CTRL+K":"showLinkDialog"},mac:{ENTER:"insertParagraph","CMD+Z":"undo","CMD+SHIFT+Z":"redo",TAB:"tab","SHIFT+TAB":"untab","CMD+B":"bold","CMD+I":"italic","CMD+U":"underline","CMD+SHIFT+S":"strikethrough","CMD+BACKSLASH":"removeFormat","CMD+SHIFT+L":"justifyLeft","CMD+SHIFT+E":"justifyCenter","CMD+SHIFT+R":"justifyRight","CMD+SHIFT+J":"justifyFull","CMD+SHIFT+NUM7":"insertUnorderedList","CMD+SHIFT+NUM8":"insertOrderedList","CMD+LEFTBRACKET":"outdent","CMD+RIGHTBRACKET":"indent","CMD+NUM0":"formatPara","CMD+NUM1":"formatH1","CMD+NUM2":"formatH2","CMD+NUM3":"formatH3","CMD+NUM4":"formatH4","CMD+NUM5":"formatH5","CMD+NUM6":"formatH6","CMD+ENTER":"insertHorizontalRule","CMD+K":"showLinkDialog"}}},lang:{"en-US":{font:{bold:"Bold",italic:"Italic",underline:"Underline",strikethrough:"Strikethrough",subscript:"Subscript",superscript:"Superscript",clear:"Remove Font Style",height:"Line Height",name:"Font Family",size:"Font Size"},image:{image:"Picture",insert:"Insert Image",resizeFull:"Resize Full",resizeHalf:"Resize Half",resizeQuarter:"Resize Quarter",floatLeft:"Float Left",floatRight:"Float Right",floatNone:"Float None",dragImageHere:"Drag an image here",selectFromFiles:"Select from files",url:"Image URL",remove:"Remove Image"},link:{link:"Link",insert:"Insert Link",unlink:"Unlink",edit:"Edit",textToDisplay:"Text to display",url:"To what URL should this link go?",openInNewWindow:"Open in new window"},video:{video:"Video",videoLink:"Video Link",insert:"Insert Video",url:"Video URL?",providers:"(YouTube, Vimeo, Vine, Instagram, DailyMotion or Youku)"},table:{table:"Table"},hr:{insert:"Insert Horizontal Rule"},style:{style:"Style",normal:"Normal",blockquote:"Quote",pre:"Code",h1:"Header 1",h2:"Header 2",h3:"Header 3",h4:"Header 4",h5:"Header 5",h6:"Header 6"},lists:{unordered:"Unordered list",ordered:"Ordered list"},options:{help:"Help",fullscreen:"Full Screen",codeview:"Code View"},paragraph:{paragraph:"Paragraph",outdent:"Outdent",indent:"Indent",left:"Align left",center:"Align center",right:"Align right",justify:"Justify full"},color:{recent:"Recent Color",more:"More Color",background:"Background Color",foreground:"Foreground Color",transparent:"Transparent",setTransparent:"Set transparent",reset:"Reset",resetToDefault:"Reset to default"},shortcut:{shortcuts:"Keyboard shortcuts",close:"Close",textFormatting:"Text formatting",action:"Action",paragraphFormatting:"Paragraph formatting",documentStyle:"Document Style"},history:{undo:"Undo",redo:"Redo"}}}},l=function(){var b=function(b){return a.Deferred(function(c){a.extend(new FileReader,{onload:function(a){var b=a.target.result;c.resolve(b)},onerror:function(){c.reject(this)}}).readAsDataURL(b)}).promise()},c=function(b,c){return a.Deferred(function(d){a("<img>").one("load",function(){d.resolve(a(this))}).one("error abort",function(){d.reject(a(this))}).css({display:"none"}).appendTo(document.body).attr("src",b).attr("data-filename",c)}).promise()};return{readFileAsDataURL:b,createImage:c}}(),m={isEdit:function(a){return-1!==[8,9,13,32].indexOf(a)},nameFromCode:{8:"BACKSPACE",9:"TAB",13:"ENTER",32:"SPACE",48:"NUM0",49:"NUM1",50:"NUM2",51:"NUM3",52:"NUM4",53:"NUM5",54:"NUM6",55:"NUM7",56:"NUM8",66:"B",69:"E",73:"I",74:"J",75:"K",76:"L",82:"R",83:"S",85:"U",89:"Y",90:"Z",191:"SLASH",219:"LEFTBRACKET",220:"BACKSLASH",221:"RIGHTBRACKET"}},n=function(){var b=function(b,c){if(e.jqueryVersion<1.9){var d={};return a.each(c,function(a,c){d[c]=b.css(c)}),d}return b.css.call(b,c)};this.stylePara=function(b,c){a.each(b.nodes(j.isPara,!0),function(b,d){a(d).css(c)})},this.current=function(c,d){var e=a(j.isText(c.sc)?c.sc.parentNode:c.sc),f=["font-family","font-size","text-align","list-style-type","line-height"],g=b(e,f)||{};if(g["font-size"]=parseInt(g["font-size"],10),g["font-bold"]=document.queryCommandState("bold")?"bold":"normal",g["font-italic"]=document.queryCommandState("italic")?"italic":"normal",g["font-underline"]=document.queryCommandState("underline")?"underline":"normal",g["font-strikethrough"]=document.queryCommandState("strikeThrough")?"strikethrough":"normal",g["font-superscript"]=document.queryCommandState("superscript")?"superscript":"normal",g["font-subscript"]=document.queryCommandState("subscript")?"subscript":"normal",c.isOnList()){var h=["circle","disc","disc-leading-zero","square"],i=a.inArray(g["list-style-type"],h)>-1;g["list-style"]=i?"unordered":"ordered"}else g["list-style"]="none";var k=j.ancestor(c.sc,j.isPara);if(k&&k.style["line-height"])g["line-height"]=k.style.lineHeight;else{var l=parseInt(g["line-height"],10)/parseInt(g["font-size"],10);g["line-height"]=l.toFixed(1)}return g.image=j.isImg(d)&&d,g.anchor=c.isOnAnchor()&&j.ancestor(c.sc,j.isAnchor),g.ancestors=j.listAncestor(c.sc,j.isEditable),g.range=c,g}},o=function(){var b=function(a,b){var c,d,e=a.parentElement(),f=document.body.createTextRange(),h=g.from(e.childNodes);for(c=0;c<h.length;c++)if(!j.isText(h[c])){if(f.moveToElementText(h[c]),f.compareEndPoints("StartToStart",a)>=0)break;d=h[c]}if(0!==c&&j.isText(h[c-1])){var i=document.body.createTextRange(),k=null;i.moveToElementText(d||e),i.collapse(!d),k=d?d.nextSibling:e.firstChild;var l=a.duplicate();l.setEndPoint("StartToStart",i);for(var m=l.text.replace(/[\r\n]/g,"").length;m>k.nodeValue.length&&k.nextSibling;)m-=k.nodeValue.length,k=k.nextSibling;{k.nodeValue}b&&k.nextSibling&&j.isText(k.nextSibling)&&m===k.nodeValue.length&&(m-=k.nodeValue.length,k=k.nextSibling),e=k,c=m}return{cont:e,offset:c}},c=function(a){var b=function(a,c){var d,e;if(j.isText(a)){var h=j.listPrev(a,f.not(j.isText)),i=g.last(h).previousSibling;d=i||a.parentNode,c+=g.sum(g.tail(h),j.nodeLength),e=!i}else{if(d=a.childNodes[c]||a,j.isText(d))return b(d,0);c=0,e=!1}return{node:d,collapseToStart:e,offset:c}},c=document.body.createTextRange(),d=b(a.node,a.offset);return c.moveToElementText(d.node),c.collapse(d.collapseToStart),c.moveStart("character",d.offset),c},d=function(b,h,i,k){this.sc=b,this.so=h,this.ec=i,this.eo=k;var l=function(){if(e.isW3CRangeSupport){var a=document.createRange();return a.setStart(b,h),a.setEnd(i,k),a}var d=c({node:b,offset:h});return d.setEndPoint("EndToEnd",c({node:i,offset:k})),d};this.getPoints=function(){return{sc:b,so:h,ec:i,eo:k}},this.getStartPoint=function(){return{node:b,offset:h}},this.getEndPoint=function(){return{node:i,offset:k}},this.select=function(){var a=l();if(e.isW3CRangeSupport){var b=document.getSelection();b.rangeCount>0&&b.removeAllRanges(),b.addRange(a)}else a.select()},this.nodes=function(a,b){a=a||f.ok;for(var c=[],d=this.getStartPoint(),e=this.getEndPoint();d;){if(b){var h=j.ancestor(d.node,a);h&&c.push(h)}else a(d.node)&&c.push(d.node);if(j.isSamePoint(d,e))break;d=j.nextPoint(d,!0)}return g.unique(c)},this.commonAncestor=function(){return j.commonAncestor(b,i)},this.expand=function(a){var c=j.ancestor(b,a),e=j.ancestor(i,a);if(!c&&!e)return new d(b,h,i,k);var f=this.getPoints();return c&&(f.sc=c,f.so=0),e&&(f.ec=e,f.eo=j.nodeLength(e)),new d(f.sc,f.so,f.ec,f.eo)},this.collapse=function(a){return a?new d(b,h,b,h):new d(i,k,i,k)},this.splitText=function(){var a=b===i,c=this.getPoints();return j.isText(i)&&!j.isEdgePoint(this.getEndPoint())&&i.splitText(k),j.isText(b)&&!j.isEdgePoint(this.getStartPoint())&&(c.sc=b.splitText(h),c.so=0,a&&(c.ec=c.sc,c.eo=k-h)),new d(c.sc,c.so,c.ec,c.eo)},this.deleteContents=function(){if(this.isCollapsed())return this;var b=this.splitText(),c=j.prevPoint(b.getStartPoint());return a.each(b.nodes(),function(a,b){j.remove(b,!j.isPara(b))}),new d(c.node,c.offset,c.node,c.offset)};var m=function(a){return function(){var c=j.ancestor(b,a);return!!c&&c===j.ancestor(i,a)}};this.isOnEditable=m(j.isEditable),this.isOnList=m(j.isList),this.isOnAnchor=m(j.isAnchor),this.isOnCell=m(j.isCell),this.isCollapsed=function(){return b===i&&h===k},this.wrapBodyTextWithPara=function(){a.each(this.nodes(j.isBodyText),function(a,b){j.wrap(b,"p")})},this.insertNode=function(a,b){var c=this.getStartPoint();this.wrapBodyTextWithPara();var d,e,f;if(b)e=j.isPara(c.node)?c.node:c.node.parentNode,f=j.isPara(c.node)?c.node.childNodes[c.offset]:j.splitTree(c.node,c);else{var h=j.listAncestor(c.node,j.isBodyContainer);d=h[h.length-2],e=g.last(h),f=d&&j.splitTree(d,c)}return f?f.parentNode.insertBefore(a,f):e.appendChild(a),a},this.toString=function(){var a=l();return e.isW3CRangeSupport?a.toString():a.text},this.bookmark=function(a){return{s:{path:j.makeOffsetPath(a,b),offset:h},e:{path:j.makeOffsetPath(a,i),offset:k}}},this.getClientRects=function(){var a=l();return a.getClientRects()}};return{create:function(a,c,f,g){if(arguments.length)2===arguments.length&&(f=a,g=c);else if(e.isW3CRangeSupport){var h=document.getSelection();if(0===h.rangeCount)return null;var i=h.getRangeAt(0);a=i.startContainer,c=i.startOffset,f=i.endContainer,g=i.endOffset}else{var j=document.selection.createRange(),k=j.duplicate();k.collapse(!1);var l=j;l.collapse(!0);var m=b(l,!0),n=b(k,!1);a=m.cont,c=m.offset,f=n.cont,g=n.offset}return new d(a,c,f,g)},createFromNode:function(a){return this.create(a,0,a,1)},createFromBookmark:function(a,b){var c=j.fromOffsetPath(a,b.s.path),e=b.s.offset,f=j.fromOffsetPath(a,b.e.path),g=b.e.offset;return new d(c,e,f,g)}}}(),p=function(){this.tab=function(a,b){var c=j.ancestor(a.commonAncestor(),j.isCell),d=j.ancestor(c,j.isTable),e=j.listDescendant(d,j.isCell),f=g[b?"prev":"next"](e,c);f&&o.create(f,0).select()},this.createTable=function(b,c){for(var d,e=[],f=0;b>f;f++)e.push("<td>"+j.blank+"</td>");d=e.join("");for(var g,h=[],i=0;c>i;i++)h.push("<tr>"+d+"</tr>");return g=h.join(""),a('<table class="table table-bordered">'+g+"</table>")[0]}},q=function(){var b=new n,c=new p;this.saveRange=function(a){a.focus(),a.data("range",o.create())},this.restoreRange=function(a){var b=a.data("range");b&&(b.select(),a.focus())},this.currentStyle=function(a){var c=o.create();return c?c.isOnEditable()&&b.current(c,a):!1},this.undo=function(a){a.data("NoteHistory").undo(a)},this.redo=function(a){a.data("NoteHistory").redo(a)};for(var d=this.recordUndo=function(a){a.data("NoteHistory").recordUndo(a)},f=["bold","italic","underline","strikethrough","superscript","subscript","justifyLeft","justifyCenter","justifyRight","justifyFull","insertOrderedList","insertUnorderedList","indent","outdent","formatBlock","removeFormat","backColor","foreColor","insertHorizontalRule","fontName"],h=0,i=f.length;i>h;h++)this[f[h]]=function(a){return function(b,c){d(b),document.execCommand(a,!1,c)}}(f[h]);var k=function(a,b,c){d(a);var e=j.createText(new Array(c+1).join(j.NBSP_CHAR));b=b.deleteContents(),b.insertNode(e,!0),b=o.create(e,c),b.select()};this.tab=function(a,b){var d=o.create();d.isCollapsed()&&d.isOnCell()?c.tab(d):k(a,d,b.tabsize)},this.untab=function(){var a=o.create();a.isCollapsed()&&a.isOnCell()&&c.tab(a,!0)},this.insertParagraph=function(a){d(a);var b=o.create();b=b.deleteContents(),b.wrapBodyTextWithPara();var c=j.ancestor(b.sc,j.isPara),e=j.splitTree(c,b.getStartPoint());o.create(e,0).select()},this.insertImage=function(a,b,c){l.createImage(b,c).then(function(b){d(a),b.css({display:"",width:Math.min(a.width(),b.width())}),o.create().insertNode(b[0])}).fail(function(){var b=a.data("callbacks");b.onImageUploadError&&b.onImageUploadError()})},this.insertVideo=function(b,c){d(b);var e,f=/^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/,g=c.match(f),h=/\/\/instagram.com\/p\/(.[a-zA-Z0-9]*)/,i=c.match(h),j=/\/\/vine.co\/v\/(.[a-zA-Z0-9]*)/,k=c.match(j),l=/\/\/(player.)?vimeo.com\/([a-z]*\/)*([0-9]{6,11})[?]?.*/,m=c.match(l),n=/.+dailymotion.com\/(video|hub)\/([^_]+)[^#]*(#video=([^_&]+))?/,p=c.match(n),q=/\/\/v\.youku\.com\/v_show\/id_(\w+)\.html/,r=c.match(q);if(g&&11===g[2].length){var s=g[2];e=a("<iframe>").attr("src","//www.youtube.com/embed/"+s).attr("width","640").attr("height","360")}else i&&i[0].length?e=a("<iframe>").attr("src",i[0]+"/embed/").attr("width","612").attr("height","710").attr("scrolling","no").attr("allowtransparency","true"):k&&k[0].length?e=a("<iframe>").attr("src",k[0]+"/embed/simple").attr("width","600").attr("height","600").attr("class","vine-embed"):m&&m[3].length?e=a("<iframe webkitallowfullscreen mozallowfullscreen allowfullscreen>").attr("src","//player.vimeo.com/video/"+m[3]).attr("width","640").attr("height","360"):p&&p[2].length?e=a("<iframe>").attr("src","//www.dailymotion.com/embed/video/"+p[2]).attr("width","640").attr("height","360"):r&&r[1].length&&(e=a("<iframe webkitallowfullscreen mozallowfullscreen allowfullscreen>").attr("height","498").attr("width","510").attr("src","//player.youku.com/embed/"+r[1]));e&&(e.attr("frameborder",0),o.create().insertNode(e[0]))},this.formatBlock=function(a,b){d(a),b=e.isMSIE?"<"+b+">":b,document.execCommand("FormatBlock",!1,b)},this.formatPara=function(a){this.formatBlock(a,"P")};for(var h=1;6>=h;h++)this["formatH"+h]=function(a){return function(b){this.formatBlock(b,"H"+a)}}(h);this.fontSize=function(a,b){d(a),document.execCommand("fontSize",!1,3),e.isFF?a.find("font[size=3]").removeAttr("size").css("font-size",b+"px"):a.find("span").filter(function(){return"medium"===this.style.fontSize}).css("font-size",b+"px")},this.lineHeight=function(a,c){d(a),b.stylePara(o.create(),{lineHeight:c})},this.unlink=function(a){var b=o.create();if(b.isOnAnchor()){d(a);var c=j.ancestor(b.sc,j.isAnchor);b=o.createFromNode(c),b.select(),document.execCommand("unlink")}},this.createLink=function(b,c,e){var f=c.url,g=c.text,h=c.newWindow,i=c.range;d(b),e.onCreateLink&&(f=e.onCreateLink(f)),i=i.deleteContents();var j=i.insertNode(a("<A>"+g+"</A>")[0],!0);a(j).attr({href:f,target:h?"_blank":""}),i=o.createFromNode(j),i.select()},this.getLinkInfo=function(b){b.focus();var c=o.create().expand(j.isAnchor),d=a(g.head(c.nodes(j.isAnchor)));return{range:c,text:c.toString(),isNewWindow:d.length?"_blank"===d.attr("target"):!0,url:d.length?d.attr("href"):""}},this.getVideoInfo=function(a){a.focus();var b=o.create();if(b.isOnAnchor()){var c=j.ancestor(b.sc,j.isAnchor);b=o.createFromNode(c)}return{text:b.toString()}},this.color=function(a,b){var c=JSON.parse(b),e=c.foreColor,f=c.backColor;d(a),e&&document.execCommand("foreColor",!1,e),f&&document.execCommand("backColor",!1,f)},this.insertTable=function(a,b){d(a);var e=b.split("x"),f=o.create();f=f.deleteContents(),f.insertNode(c.createTable(e[0],e[1]))},this.floatMe=function(a,b,c){d(a),c.css("float",b)},this.resize=function(a,b,c){d(a),c.css({width:a.width()*b+"px",height:""})},this.resizeTo=function(a,b,c){var d;if(c){var e=a.y/a.x,f=b.data("ratio");d={width:f>e?a.x:a.y/f,height:f>e?a.x*f:a.y}}else d={width:a.x,height:a.y};b.css(d)},this.removeMedia=function(a,b,c){d(a),c.detach()}},r=function(){var a=[],b=[],c=function(a){var b=a[0],c=o.create();return{contents:a.html(),bookmark:c.bookmark(b),scrollTop:a.scrollTop()}},d=function(a,b){a.html(b.contents).scrollTop(b.scrollTop),o.createFromBookmark(a[0],b.bookmark).select()};this.undo=function(e){var f=c(e);a.length&&(d(e,a.pop()),b.push(f))},this.redo=function(e){var f=c(e);b.length&&(d(e,b.pop()),a.push(f))},this.recordUndo=function(d){b=[],a.push(c(d))}},s=function(){this.update=function(b,c){var d=function(b,c){b.find(".dropdown-menu li a").each(function(){var b=a(this).data("value")+""==c+"";this.className=b?"checked":""})},e=function(a,c){var d=b.find(a);d.toggleClass("active",c())},f=b.find(".note-fontname");if(f.length){var h=c["font-family"];h&&(h=g.head(h.split(",")),h=h.replace(/\'/g,""),f.find(".note-current-fontname").text(h),d(f,h))}var i=b.find(".note-fontsize");i.find(".note-current-fontsize").text(c["font-size"]),d(i,parseFloat(c["font-size"]));var j=b.find(".note-height");d(j,parseFloat(c["line-height"])),e('button[data-event="bold"]',function(){return"bold"===c["font-bold"]}),e('button[data-event="italic"]',function(){return"italic"===c["font-italic"]}),e('button[data-event="underline"]',function(){return"underline"===c["font-underline"]}),e('button[data-event="strikethrough"]',function(){return"strikethrough"===c["font-strikethrough"]}),e('button[data-event="superscript"]',function(){return"superscript"===c["font-superscript"]}),e('button[data-event="subscript"]',function(){return"subscript"===c["font-subscript"]}),e('button[data-event="justifyLeft"]',function(){return"left"===c["text-align"]||"start"===c["text-align"]}),e('button[data-event="justifyCenter"]',function(){return"center"===c["text-align"]}),e('button[data-event="justifyRight"]',function(){return"right"===c["text-align"]}),e('button[data-event="justifyFull"]',function(){return"justify"===c["text-align"]}),e('button[data-event="insertUnorderedList"]',function(){return"unordered"===c["list-style"]}),e('button[data-event="insertOrderedList"]',function(){return"ordered"===c["list-style"]})},this.updateRecentColor=function(b,c,d){var e=a(b).closest(".note-color"),f=e.find(".note-recent-color"),g=JSON.parse(f.attr("data-value"));g[c]=d,f.attr("data-value",JSON.stringify(g));var h="backColor"===c?"background-color":"color";f.find("i").css(h,d)}},t=function(){var a=new s;this.update=function(b,c){a.update(b,c)},this.updateRecentColor=function(b,c,d){a.updateRecentColor(b,event,d)},this.activate=function(a){a.find("button").not('button[data-event="codeview"]').removeClass("disabled")},this.deactivate=function(a){a.find("button").not('button[data-event="codeview"]').addClass("disabled")},this.updateFullscreen=function(a,b){var c=a.find('button[data-event="fullscreen"]');c.toggleClass("active",b)},this.updateCodeview=function(a,b){var c=a.find('button[data-event="codeview"]');c.toggleClass("active",b)}},u=function(){var b=new s,c=function(b,c){var d=a(b),e=c?d.offset():d.position(),f=d.outerHeight(!0);return{left:e.left,top:e.top+f}},d=function(a,b){a.css({display:"block",left:b.left,top:b.top})},e=20;this.update=function(h,i,j){b.update(h,i);var k=h.find(".note-link-popover");if(i.anchor){var l=k.find("a"),m=a(i.anchor).attr("href");l.attr("href",m).html(m),d(k,c(i.anchor,j))}else k.hide();var n=h.find(".note-image-popover");i.image?d(n,c(i.image,j)):n.hide();var o=h.find(".note-air-popover");if(j&&!i.range.isCollapsed()){var p=f.rect2bnd(g.last(i.range.getClientRects()));d(o,{left:Math.max(p.left+p.width/2-e,0),top:p.top+p.height})}else o.hide()},this.updateRecentColor=function(a,b,c){a.updateRecentColor(a,b,c)},this.hide=function(a){a.children().hide()}},v=function(){this.update=function(b,c,d){var e=b.find(".note-control-selection");if(c.image){var f=a(c.image),g=d?f.offset():f.position(),h={w:f.outerWidth(!0),h:f.outerHeight(!0)};e.css({display:"block",left:g.left,top:g.top,width:h.w,height:h.h}).data("target",c.image);var i=h.w+"x"+h.h;e.find(".note-control-selection-info").text(i)}else e.hide()},this.hide=function(a){a.children().hide()}},w=function(){var b=function(a,b){a.toggleClass("disabled",!b),a.attr("disabled",!b)};this.showImageDialog=function(c,d){return a.Deferred(function(a){var c=d.find(".note-image-dialog"),e=d.find(".note-image-input"),f=d.find(".note-image-url"),g=d.find(".note-image-btn");c.one("shown.bs.modal",function(){e.replaceWith(e.clone().on("change",function(){a.resolve(this.files),c.modal("hide")}).val("")),g.click(function(b){b.preventDefault(),a.resolve(f.val()),c.modal("hide")}),f.on("keyup paste",function(a){var c;c="paste"===a.type?a.originalEvent.clipboardData.getData("text"):f.val(),b(g,c)}).val("").trigger("focus")}).one("hidden.bs.modal",function(){e.off("change"),f.off("keyup paste"),g.off("click"),"pending"===a.state()&&a.reject()}).modal("show")})},this.showVideoDialog=function(c,d,e){return a.Deferred(function(a){var c=d.find(".note-video-dialog"),f=c.find(".note-video-url"),g=c.find(".note-video-btn");c.one("shown.bs.modal",function(){f.val(e.text).keyup(function(){b(g,f.val())}).trigger("keyup").trigger("focus"),g.click(function(b){b.preventDefault(),a.resolve(f.val()),c.modal("hide")})}).one("hidden.bs.modal",function(){f.off("keyup"),g.off("click"),"pending"===a.state()&&a.reject()}).modal("show")})},this.showLinkDialog=function(c,d,e){return a.Deferred(function(a){var c=d.find(".note-link-dialog"),f=c.find(".note-link-text"),g=c.find(".note-link-url"),h=c.find(".note-link-btn"),i=c.find("input[type=checkbox]");c.one("shown.bs.modal",function(){f.val(e.text),f.keyup(function(){e.text=f.val()}),e.url||(e.url=e.text,b(h,e.text)),g.keyup(function(){b(h,g.val()),e.text||f.val(g.val())}).val(e.url).trigger("focus").trigger("select"),i.prop("checked",e.newWindow),h.one("click",function(b){b.preventDefault(),a.resolve({range:e.range,url:g.val(),text:f.val(),newWindow:i.is(":checked")}),c.modal("hide")})}).one("hidden.bs.modal",function(){f.off("keyup"),g.off("keyup"),h.off("click"),"pending"===a.state()&&a.reject()}).modal("show")}).promise()},this.showHelpDialog=function(b,c){return a.Deferred(function(a){var b=c.find(".note-help-dialog");b.one("hidden.bs.modal",function(){a.resolve()}).modal("show")}).promise()}};e.hasCodeMirror&&(e.isSupportAmd?require(["CodeMirror"],function(a){b=a}):b=window.CodeMirror);var x=function(){var c=a(window),d=a(document),f=a("html, body"),h=new q,i=new t,k=new u,n=new v,o=new w,p=function(b){var c=a(b).closest(".note-editor, .note-air-editor, .note-air-layout");if(!c.length)return null;var d;return d=c.is(".note-editor, .note-air-editor")?c:a("#note-editor-"+g.last(c.attr("id").split("-"))),j.buildLayoutInfo(d)},s=function(b,c){h.restoreRange(b);var d=b.data("callbacks");d.onImageUpload?d.onImageUpload(c,h,b):a.each(c,function(a,c){var e=c.name;l.readFileAsDataURL(c).then(function(a){h.insertImage(b,a,e)}).fail(function(){d.onImageUploadError&&d.onImageUploadError()})})},x={showLinkDialog:function(a){var b=a.editor(),c=a.dialog(),d=a.editable(),e=h.getLinkInfo(d),f=b.data("options");h.saveRange(d),o.showLinkDialog(d,c,e).then(function(b){h.restoreRange(d),h.createLink(d,b,f),k.hide(a.popover())
}).fail(function(){h.restoreRange(d)})},showImageDialog:function(a){var b=a.dialog(),c=a.editable();h.saveRange(c),o.showImageDialog(c,b).then(function(a){h.restoreRange(c),"string"==typeof a?h.insertImage(c,a):s(c,a)}).fail(function(){h.restoreRange(c)})},showVideoDialog:function(a){var b=a.dialog(),c=a.editable(),d=h.getVideoInfo(c);h.saveRange(c),o.showVideoDialog(c,b,d).then(function(a){h.restoreRange(c),h.insertVideo(c,a)}).fail(function(){h.restoreRange(c)})},showHelpDialog:function(a){var b=a.dialog(),c=a.editable();h.saveRange(c),o.showHelpDialog(c,b).then(function(){h.restoreRange(c)})},fullscreen:function(a){var b=a.editor(),d=a.toolbar(),e=a.editable(),g=a.codable(),h=b.data("options"),j=function(a){b.css("width",a.w),e.css("height",a.h),g.css("height",a.h),g.data("cmeditor")&&g.data("cmeditor").setsize(null,a.h)};b.toggleClass("fullscreen");var k=b.hasClass("fullscreen");k?(e.data("orgheight",e.css("height")),c.on("resize",function(){j({w:c.width(),h:c.height()-d.outerHeight()})}).trigger("resize"),f.css("overflow","hidden")):(c.off("resize"),j({w:h.width||"",h:e.data("orgheight")}),f.css("overflow","visible")),i.updateFullscreen(d,k)},codeview:function(a){var c,d,f=a.editor(),g=a.toolbar(),h=a.editable(),l=a.codable(),m=a.popover(),n=f.data("options");f.toggleClass("codeview");var o=f.hasClass("codeview");o?(l.val(h.html()),l.height(h.height()),i.deactivate(g),k.hide(m),l.focus(),e.hasCodeMirror&&(c=b.fromTextArea(l[0],n.codemirror),n.codemirror.tern&&(d=new b.TernServer(n.codemirror.tern),c.ternServer=d,c.on("cursorActivity",function(a){d.updateArgHints(a)})),c.setSize(null,h.outerHeight()),n.codemirror.autoFormatOnStart&&c.autoFormatRange&&c.autoFormatRange({line:0,ch:0},{line:c.lineCount(),ch:c.getTextArea().value.length}),l.data("cmEditor",c))):(e.hasCodeMirror&&(c=l.data("cmEditor"),l.val(c.getValue()),c.toTextArea()),h.html(l.val()||j.emptyPara),h.height(n.height?l.height():"auto"),i.activate(g),h.focus()),i.updateCodeview(a.toolbar(),o)}},y=function(a){j.isImg(a.target)&&a.preventDefault()},z=function(a){setTimeout(function(){var b=p(a.currentTarget||a.target),c=h.currentStyle(a.target);if(c){var d=b.editor().data("options").airMode;d||i.update(b.toolbar(),c),k.update(b.popover(),c,d),n.update(b.handle(),c,d)}},0)},A=function(a){var b=p(a.currentTarget||a.target);k.hide(b.popover()),n.hide(b.handle())},B=function(a){var b=a.originalEvent.clipboardData;if(b&&b.items&&b.items.length){var c=p(a.currentTarget||a.target),d=g.head(b.items),e="file"===d.kind&&-1!==d.type.indexOf("image/");e&&s(c.editable(),[d.getAsFile()])}},C=function(b){if(j.isControlSizing(b.target)){b.preventDefault(),b.stopPropagation();var c=p(b.target),e=c.handle(),f=c.popover(),g=c.editable(),i=c.editor(),l=e.find(".note-control-selection").data("target"),m=a(l),o=m.offset(),q=d.scrollTop(),r=i.data("options").airMode;d.on("mousemove",function(a){h.resizeTo({x:a.clientX-o.left,y:a.clientY-(o.top-q)},m,!a.shiftKey),n.update(e,{image:l},r),k.update(f,{image:l},r)}).one("mouseup",function(){d.off("mousemove")}),m.data("ratio")||m.data("ratio",m.height()/m.width()),h.recordUndo(g)}},D=function(b){var c=a(b.target).closest("[data-event]");c.length&&b.preventDefault()},E=function(b){var c=a(b.target).closest("[data-event]");if(c.length){var d=c.attr("data-event"),e=c.attr("data-value"),f=p(b.target);b.preventDefault();var j;if(-1!==a.inArray(d,["resize","floatMe","removeMedia"])){var l=f.handle().find(".note-control-selection");j=a(l.data("target"))}if(h[d]){var m=f.editable();m.trigger("focus"),h[d](m,e,j)}else x[d]&&x[d].call(this,f);if(-1!==a.inArray(d,["backColor","foreColor"])){var n=f.editor().data("options",n),o=n.airMode?k:i;o.updateRecentColor(g.head(c),d,e)}z(b)}},F=24,G=function(a){a.preventDefault(),a.stopPropagation();var b=p(a.target).editable(),c=b.offset().top-d.scrollTop(),e=p(a.currentTarget||a.target),f=e.editor().data("options");d.on("mousemove",function(a){var d=a.clientY-(c+F);d=f.minHeight>0?Math.max(d,f.minHeight):d,d=f.maxHeight>0?Math.min(d,f.maxHeight):d,b.height(d)}).one("mouseup",function(){d.off("mousemove")})},H=18,I=function(b,c){var d,e=a(b.target.parentNode),f=e.next(),g=e.find(".note-dimension-picker-mousecatcher"),h=e.find(".note-dimension-picker-highlighted"),i=e.find(".note-dimension-picker-unhighlighted");if(void 0===b.offsetX){var j=a(b.target).offset();d={x:b.pageX-j.left,y:b.pageY-j.top}}else d={x:b.offsetX,y:b.offsetY};var k={c:Math.ceil(d.x/H)||1,r:Math.ceil(d.y/H)||1};h.css({width:k.c+"em",height:k.r+"em"}),g.attr("data-value",k.c+"x"+k.r),3<k.c&&k.c<c.insertTableMaxSize.col&&i.css({width:k.c+1+"em"}),3<k.r&&k.r<c.insertTableMaxSize.row&&i.css({height:k.r+1+"em"}),f.html(k.c+" x "+k.r)},J=function(a,b){b?d.on("drop",function(a){a.preventDefault()}):K(a)},K=function(b){var c=a(),e=b.dropzone,f=b.dropzone.find(".note-dropzone-message");d.on("dragenter",function(a){var d=b.editor.hasClass("codeview");d||c.length||(b.editor.addClass("dragover"),e.width(b.editor.width()),e.height(b.editor.height()),f.text("Drag Image Here")),c=c.add(a.target)}).on("dragleave",function(a){c=c.not(a.target),c.length||b.editor.removeClass("dragover")}).on("drop",function(){c=a(),b.editor.removeClass("dragover")}),e.on("dragenter",function(){e.addClass("hover"),f.text("Drop Image")}).on("dragleave",function(){e.removeClass("hover"),f.text("Drag Image Here")}),e.on("drop",function(a){a.preventDefault();var b=a.originalEvent.dataTransfer;if(b&&b.files){var c=p(a.currentTarget||a.target);c.editable().focus(),s(c.editable(),b.files)}}).on("dragover",!1)};this.bindKeyMap=function(a,b){var c=a.editor,d=a.editable;a=p(d),d.on("keydown",function(e){var f=[];e.metaKey&&f.push("CMD"),e.ctrlKey&&!e.altKey&&f.push("CTRL"),e.shiftKey&&f.push("SHIFT");var g=m.nameFromCode[e.keyCode];g&&f.push(g);var i=b[f.join("+")];i?(e.preventDefault(),h[i]?h[i](d,c.data("options")):x[i]&&x[i].call(this,a)):m.isEdit(e.keyCode)&&h.recordUndo(d)})},this.attach=function(a,b){this.bindKeyMap(a,b.keyMap[e.isMac?"mac":"pc"]),a.editable.on("mousedown",y),a.editable.on("keyup mouseup",z),a.editable.on("scroll",A),a.editable.on("paste",B),a.handle.on("mousedown",C),a.popover.on("click",E),a.popover.on("mousedown",D),b.airMode||(J(a,b.disableDragAndDrop),a.toolbar.on("click",E),a.toolbar.on("mousedown",D),b.disableResizeEditor||a.statusbar.on("mousedown",G));var c=b.airMode?a.popover:a.toolbar,d=c.find(".note-dimension-picker-mousecatcher");if(d.css({width:b.insertTableMaxSize.col+"em",height:b.insertTableMaxSize.row+"em"}).on("mousemove",function(a){I(a,b)}),a.editor.data("options",b),b.styleWithSpan&&!e.isMSIE&&setTimeout(function(){document.execCommand("styleWithCSS",0,!0)},0),a.editable.data("NoteHistory",new r),b.onenter&&a.editable.keypress(function(a){a.keyCode===m.ENTER&&b.onenter(a)}),b.onfocus&&a.editable.focus(b.onfocus),b.onblur&&a.editable.blur(b.onblur),b.onkeyup&&a.editable.keyup(b.onkeyup),b.onkeydown&&a.editable.keydown(b.onkeydown),b.onpaste&&a.editable.on("paste",b.onpaste),b.onToolbarClick&&a.toolbar.click(b.onToolbarClick),b.onChange){var f=function(){b.onChange(a.editable,a.editable.html())};if(e.isMSIE){var g="DOMCharacterDataModified DOMSubtreeModified DOMNodeInserted";a.editable.on(g,f)}else a.editable.on("input",f)}a.editable.data("callbacks",{onAutoSave:b.onAutoSave,onImageUpload:b.onImageUpload,onImageUploadError:b.onImageUploadError,onFileUpload:b.onFileUpload,onFileUploadError:b.onFileUpload})},this.dettach=function(a,b){a.editable.off(),a.popover.off(),a.handle.off(),a.dialog.off(),b.airMode||(a.dropzone.off(),a.toolbar.off(),a.statusbar.off())}},y=function(){var b=function(a,b){var c=b.event,d=b.value,e=b.title,f=b.className,g=b.dropdown;return'<button type="button" class="btn btn-default btn-sm btn-small'+(f?" "+f:"")+(g?" dropdown-toggle":"")+'"'+(g?' data-toggle="dropdown"':"")+(e?' title="'+e+'"':"")+(c?' data-event="'+c+'"':"")+(d?" data-value='"+d+"'":"")+' tabindex="-1">'+a+(g?' <span class="caret"></span>':"")+"</button>"+(g||"")},c=function(a,c){var d='<i class="'+a+'"></i>';return b(d,c)},d=function(a,b){return'<div class="'+a+' popover bottom in" style="display: none;"><div class="arrow"></div><div class="popover-content">'+b+"</div></div>"},g=function(a,b,c,d){return'<div class="'+a+' modal" aria-hidden="false"><div class="modal-dialog"><div class="modal-content">'+(b?'<div class="modal-header"><button type="button" class="close" aria-hidden="true" tabindex="-1">&times;</button><h4 class="modal-title">'+b+"</h4></div>":"")+'<form class="note-modal-form"><div class="modal-body"><div class="row-fluid">'+c+"</div></div>"+(d?'<div class="modal-footer">'+d+"</div>":"")+"</form></div></div></div>"},h={picture:function(a){return c("fa fa-picture-o icon-picture",{event:"showImageDialog",title:a.image.image})},link:function(a){return c("fa fa-link icon-link",{event:"showLinkDialog",title:a.link.link})},video:function(a){return c("fa fa-youtube-play icon-play",{event:"showVideoDialog",title:a.video.video})},table:function(a){var b='<ul class="dropdown-menu"><div class="note-dimension-picker"><div class="note-dimension-picker-mousecatcher" data-event="insertTable" data-value="1x1"></div><div class="note-dimension-picker-highlighted"></div><div class="note-dimension-picker-unhighlighted"></div></div><div class="note-dimension-display"> 1 x 1 </div></ul>';return c("fa fa-table icon-table",{title:a.table.table,dropdown:b})},style:function(a,b){var d=b.styleTags.reduce(function(b,c){var d=a.style["p"===c?"normal":c];return b+'<li><a data-event="formatBlock" href="#" data-value="'+c+'">'+("p"===c||"pre"===c?d:"<"+c+">"+d+"</"+c+">")+"</a></li>"},"");return c("fa fa-magic icon-magic",{title:a.style.style,dropdown:'<ul class="dropdown-menu">'+d+"</ul>"})},fontname:function(a,c){var d=c.fontNames.reduce(function(a,b){return e.isFontInstalled(b)?a+'<li><a data-event="fontName" href="#" data-value="'+b+'"><i class="fa fa-check icon-ok"></i> '+b+"</a></li>":a},""),f='<span class="note-current-fontname">'+c.defaultFontName+"</span>";return b(f,{title:a.font.name,dropdown:'<ul class="dropdown-menu">'+d+"</ul>"})},fontsize:function(a,c){var d=c.fontSizes.reduce(function(a,b){return a+'<li><a data-event="fontSize" href="#" data-value="'+b+'"><i class="fa fa-check icon-ok"></i> '+b+"</a></li>"},""),e='<span class="note-current-fontsize">11</span>';return b(e,{title:a.font.size,dropdown:'<ul class="dropdown-menu">'+d+"</ul>"})},color:function(a){var c='<i class="fa fa-font icon-font" style="color:black;background-color:yellow;"></i>',d=b(c,{className:"note-recent-color",title:a.color.recent,event:"color",value:'{"backColor":"yellow"}'}),e='<ul class="dropdown-menu"><li><div class="btn-group"><div class="note-palette-title">'+a.color.background+'</div><div class="note-color-reset" data-event="backColor" data-value="inherit" title="'+a.color.transparent+'">'+a.color.setTransparent+'</div><div class="note-color-palette" data-target-event="backColor"></div></div><div class="btn-group"><div class="note-palette-title">'+a.color.foreground+'</div><div class="note-color-reset" data-event="foreColor" data-value="inherit" title="'+a.color.reset+'">'+a.color.resetToDefault+'</div><div class="note-color-palette" data-target-event="foreColor"></div></div></li></ul>',f=b("",{title:a.color.more,dropdown:e});return d+f},bold:function(a){return c("fa fa-bold icon-bold",{event:"bold",title:a.font.bold})},italic:function(a){return c("fa fa-italic icon-italic",{event:"italic",title:a.font.italic})},underline:function(a){return c("fa fa-underline icon-underline",{event:"underline",title:a.font.underline})},strikethrough:function(a){return c("fa fa-strikethrough icon-strikethrough",{event:"strikethrough",title:a.font.strikethrough})},superscript:function(a){return c("fa fa-superscript icon-superscript",{event:"superscript",title:a.font.superscript})},subscript:function(a){return c("fa fa-subscript icon-subscript",{event:"subscript",title:a.font.subscript})},clear:function(a){return c("fa fa-eraser icon-eraser",{event:"removeFormat",title:a.font.clear})},ul:function(a){return c("fa fa-list-ul icon-list-ul",{event:"insertUnorderedList",title:a.lists.unordered})},ol:function(a){return c("fa fa-list-ol icon-list-ol",{event:"insertOrderedList",title:a.lists.ordered})},paragraph:function(a){var b=c("fa fa-align-left icon-align-left",{title:a.paragraph.left,event:"justifyLeft"}),d=c("fa fa-align-center icon-align-center",{title:a.paragraph.center,event:"justifyCenter"}),e=c("fa fa-align-right icon-align-right",{title:a.paragraph.right,event:"justifyRight"}),f=c("fa fa-align-justify icon-align-justify",{title:a.paragraph.justify,event:"justifyFull"}),g=c("fa fa-outdent icon-indent-left",{title:a.paragraph.outdent,event:"outdent"}),h=c("fa fa-indent icon-indent-right",{title:a.paragraph.indent,event:"indent"}),i='<div class="dropdown-menu"><div class="note-align btn-group">'+b+d+e+f+'</div><div class="note-list btn-group">'+h+g+"</div></div>";return c("fa fa-align-left icon-align-left",{title:a.paragraph.paragraph,dropdown:i})},height:function(a,b){var d=b.lineHeights.reduce(function(a,b){return a+'<li><a data-event="lineHeight" href="#" data-value="'+parseFloat(b)+'"><i class="fa fa-check icon-ok"></i> '+b+"</a></li>"},"");return c("fa fa-text-height icon-text-height",{title:a.font.height,dropdown:'<ul class="dropdown-menu">'+d+"</ul>"})},help:function(a){return c("fa fa-question icon-question",{event:"showHelpDialog",title:a.options.help})},fullscreen:function(a){return c("fa fa-arrows-alt icon-fullscreen",{event:"fullscreen",title:a.options.fullscreen})},codeview:function(a){return c("fa fa-code icon-code",{event:"codeview",title:a.options.codeview})},undo:function(a){return c("fa fa-undo icon-undo",{event:"undo",title:a.history.undo})},redo:function(a){return c("fa fa-repeat icon-repeat",{event:"redo",title:a.history.redo})},hr:function(a){return c("fa fa-minus icon-hr",{event:"insertHorizontalRule",title:a.hr.insert})}},i=function(a,e){var f=function(){var b=c("fa fa-edit icon-edit",{title:a.link.edit,event:"showLinkDialog"}),e=c("fa fa-unlink icon-unlink",{title:a.link.unlink,event:"unlink"}),f='<a href="http://www.google.com" target="_blank">www.google.com</a>&nbsp;&nbsp;<div class="note-insert btn-group">'+b+e+"</div>";return d("note-link-popover",f)},g=function(){var e=b('<span class="note-fontsize-10">100%</span>',{title:a.image.resizeFull,event:"resize",value:"1"}),f=b('<span class="note-fontsize-10">50%</span>',{title:a.image.resizeHalf,event:"resize",value:"0.5"}),g=b('<span class="note-fontsize-10">25%</span>',{title:a.image.resizeQuarter,event:"resize",value:"0.25"}),h=c("fa fa-align-left icon-align-left",{title:a.image.floatLeft,event:"floatMe",value:"left"}),i=c("fa fa-align-right icon-align-right",{title:a.image.floatRight,event:"floatMe",value:"right"}),j=c("fa fa-align-justify icon-align-justify",{title:a.image.floatNone,event:"floatMe",value:"none"}),k=c("fa fa-trash-o icon-trash",{title:a.image.remove,event:"removeMedia",value:"none"}),l='<div class="btn-group">'+e+f+g+'</div><div class="btn-group">'+h+i+j+'</div><div class="btn-group">'+k+"</div>";return d("note-image-popover",l)},i=function(){for(var b="",c=0,f=e.airPopover.length;f>c;c++){var g=e.airPopover[c];b+='<div class="note-'+g[0]+' btn-group">';for(var i=0,j=g[1].length;j>i;i++)b+=h[g[1][i]](a,e);b+="</div>"}return d("note-air-popover",b)};return'<div class="note-popover">'+f()+g()+(e.airMode?i():"")+"</div>"},k=function(){return'<div class="note-handle"><div class="note-control-selection"><div class="note-control-selection-bg"></div><div class="note-control-holder note-control-nw"></div><div class="note-control-holder note-control-ne"></div><div class="note-control-holder note-control-sw"></div><div class="note-control-sizing note-control-se"></div><div class="note-control-selection-info"></div></div></div>'},l=function(a,b){return'<table class="note-shortcut"><thead><tr><th></th><th>'+a+"</th></tr></thead><tbody>"+b+"</tbody></table>"},m=function(a){var b="<tr><td>⌘ + B</td><td>"+a.font.bold+"</td></tr><tr><td>⌘ + I</td><td>"+a.font.italic+"</td></tr><tr><td>⌘ + U</td><td>"+a.font.underline+"</td></tr><tr><td>⌘ + ⇧ + S</td><td>"+a.font.strikethrough+"</td></tr><tr><td>⌘ + \\</td><td>"+a.font.clear+"</td></tr>";return l(a.shortcut.textFormatting,b)},n=function(a){var b="<tr><td>⌘ + Z</td><td>"+a.history.undo+"</td></tr><tr><td>⌘ + ⇧ + Z</td><td>"+a.history.redo+"</td></tr><tr><td>⌘ + ]</td><td>"+a.paragraph.indent+"</td></tr><tr><td>⌘ + [</td><td>"+a.paragraph.outdent+"</td></tr><tr><td>⌘ + ENTER</td><td>"+a.hr.insert+"</td></tr>";return l(a.shortcut.action,b)},o=function(a){var b="<tr><td>⌘ + ⇧ + L</td><td>"+a.paragraph.left+"</td></tr><tr><td>⌘ + ⇧ + E</td><td>"+a.paragraph.center+"</td></tr><tr><td>⌘ + ⇧ + R</td><td>"+a.paragraph.right+"</td></tr><tr><td>⌘ + ⇧ + J</td><td>"+a.paragraph.justify+"</td></tr><tr><td>⌘ + ⇧ + NUM7</td><td>"+a.lists.ordered+"</td></tr><tr><td>⌘ + ⇧ + NUM8</td><td>"+a.lists.unordered+"</td></tr>";return l(a.shortcut.paragraphFormatting,b)},p=function(a){var b="<tr><td>⌘ + NUM0</td><td>"+a.style.normal+"</td></tr><tr><td>⌘ + NUM1</td><td>"+a.style.h1+"</td></tr><tr><td>⌘ + NUM2</td><td>"+a.style.h2+"</td></tr><tr><td>⌘ + NUM3</td><td>"+a.style.h3+"</td></tr><tr><td>⌘ + NUM4</td><td>"+a.style.h4+"</td></tr><tr><td>⌘ + NUM5</td><td>"+a.style.h5+"</td></tr><tr><td>⌘ + NUM6</td><td>"+a.style.h6+"</td></tr>";return l(a.shortcut.documentStyle,b)},q=function(a,b){var c=b.extraKeys,d="";for(var e in c)c.hasOwnProperty(e)&&(d+="<tr><td>"+e+"</td><td>"+c[e]+"</td></tr>");return l(a.shortcut.extraKeys,d)},r=function(a,b){var c='<table class="note-shortcut-layout"><tbody><tr><td>'+n(a,b)+"</td><td>"+m(a,b)+"</td></tr><tr><td>"+p(a,b)+"</td><td>"+o(a,b)+"</td></tr>";return b.extraKeys&&(c+='<tr><td colspan="2">'+q(a,b)+"</td></tr>"),c+="</tbody</table>"},s=function(a){return a.replace(/⌘/g,"Ctrl").replace(/⇧/g,"Shift")},t=function(a,b){var c=function(){var b='<div class="note-group-select-from-files"><h5>'+a.image.selectFromFiles+'</h5><input class="note-image-input" type="file" name="files" accept="image/*" /></div><h5>'+a.image.url+'</h5><input class="note-image-url form-control span12" type="text" />',c='<button href="#" class="btn btn-primary note-image-btn disabled" disabled>'+a.image.insert+"</button>";return g("note-image-dialog",a.image.insert,b,c)},d=function(){var c='<div class="form-group"><label>'+a.link.textToDisplay+'</label><input class="note-link-text form-control span12" type="text" /></div><div class="form-group"><label>'+a.link.url+'</label><input class="note-link-url form-control span12" type="text" /></div>'+(b.disableLinkTarget?"":'<div class="checkbox"><label><input type="checkbox" checked> '+a.link.openInNewWindow+"</label></div>"),d='<button href="#" class="btn btn-primary note-link-btn disabled" disabled>'+a.link.insert+"</button>";return g("note-link-dialog",a.link.insert,c,d)},f=function(){var b='<div class="form-group"><label>'+a.video.url+'</label>&nbsp;<small class="text-muted">'+a.video.providers+'</small><input class="note-video-url form-control span12" type="text" /></div>',c='<button href="#" class="btn btn-primary note-video-btn disabled" disabled>'+a.video.insert+"</button>";return g("note-video-dialog",a.video.insert,b,c)},h=function(){var c='<a class="modal-close pull-right" aria-hidden="true" tabindex="-1">'+a.shortcut.close+'</a><div class="title">'+a.shortcut.shortcuts+"</div>"+(e.isMac?r(a,b):s(r(a,b)))+'<p class="text-center"><a href="//hackerwins.github.io/summernote/" target="_blank">Summernote 0.5.5</a> · <a href="//github.com/HackerWins/summernote" target="_blank">Project</a> · <a href="//github.com/HackerWins/summernote/issues" target="_blank">Issues</a></p>';return g("note-help-dialog","",c,"")};return'<div class="note-dialog">'+c()+d()+f()+h()+"</div>"},u=function(){return'<div class="note-resizebar"><div class="note-icon-bar"></div><div class="note-icon-bar"></div><div class="note-icon-bar"></div></div>'},v=function(a){return e.isMac&&(a=a.replace("CMD","⌘").replace("SHIFT","⇧")),a.replace("BACKSLASH","\\").replace("SLASH","/").replace("LEFTBRACKET","[").replace("RIGHTBRACKET","]")},w=function(b,c,d){var e=f.invertObject(c),g=b.find("button");g.each(function(b,c){var d=a(c),f=e[d.data("event")];f&&d.attr("title",function(a,b){return b+" ("+v(f)+")"})}).tooltip({container:"body",trigger:"hover",placement:d||"top"}).on("click",function(){a(this).tooltip("hide")})},x=function(b,c){var d=c.colors;b.find(".note-color-palette").each(function(){for(var b=a(this),c=b.attr("data-target-event"),e=[],f=0,g=d.length;g>f;f++){for(var h=d[f],i=[],j=0,k=h.length;k>j;j++){var l=h[j];i.push(['<button type="button" class="note-color-btn" style="background-color:',l,';" data-event="',c,'" data-value="',l,'" title="',l,'" data-toggle="button" tabindex="-1"></button>'].join(""))}e.push('<div class="note-color-row">'+i.join("")+"</div>")}b.html(e.join(""))})};this.createLayoutByAirMode=function(b,c){var d=c.keyMap[e.isMac?"mac":"pc"],g=a.summernote.lang[c.lang],h=f.uniqueId();b.addClass("note-air-editor note-editable"),b.attr({id:"note-editor-"+h,contentEditable:!0});var j=document.body,l=a(i(g,c));l.addClass("note-air-layout"),l.attr("id","note-popover-"+h),l.appendTo(j),w(l,d),x(l,c);var m=a(k());m.addClass("note-air-layout"),m.attr("id","note-handle-"+h),m.appendTo(j);var n=a(t(g,c));n.addClass("note-air-layout"),n.attr("id","note-dialog-"+h),n.find("button.close, a.modal-close").click(function(){a(this).closest(".modal").modal("hide")}),n.appendTo(j)},this.createLayoutByFrame=function(b,c){var d=a('<div class="note-editor"></div>');c.width&&d.width(c.width),c.height>0&&a('<div class="note-statusbar">'+(c.disableResizeEditor?"":u())+"</div>").prependTo(d);var f=!b.is(":disabled"),g=a('<div class="note-editable" contentEditable="'+f+'"></div>').prependTo(d);c.height&&g.height(c.height),c.direction&&g.attr("dir",c.direction),g.html(j.html(b)||j.emptyPara),a('<textarea class="note-codable"></textarea>').prependTo(d);for(var l=a.summernote.lang[c.lang],m="",n=0,o=c.toolbar.length;o>n;n++){var p=c.toolbar[n][0],q=c.toolbar[n][1];m+='<div class="note-'+p+' btn-group">';for(var r=0,s=q.length;s>r;r++)a.isFunction(h[q[r]])&&(m+=h[q[r]](l,c));m+="</div>"}m='<div class="note-toolbar btn-toolbar">'+m+"</div>";var v=a(m).prependTo(d),y=c.keyMap[e.isMac?"mac":"pc"];x(v,c),w(v,y,"bottom");var z=a(i(l,c)).prependTo(d);x(z,c),w(z,y),a(k()).prependTo(d);var A=a(t(l,c)).prependTo(d);A.find("button.close, a.modal-close").click(function(){a(this).closest(".modal").modal("hide")}),a('<div class="note-dropzone"><div class="note-dropzone-message"></div></div>').prependTo(d),d.insertAfter(b),b.hide()},this.noteEditorFromHolder=function(b){return b.hasClass("note-air-editor")?b:b.next().hasClass("note-editor")?b.next():a()},this.createLayout=function(a,b){this.noteEditorFromHolder(a).length||(b.airMode?this.createLayoutByAirMode(a,b):this.createLayoutByFrame(a,b))},this.layoutInfoFromHolder=function(a){var b=this.noteEditorFromHolder(a);if(b.length){var c=j.buildLayoutInfo(b);for(var d in c)c.hasOwnProperty(d)&&(c[d]=c[d].call());return c}},this.removeLayout=function(a,b,c){c.airMode?(a.removeClass("note-air-editor note-editable").removeAttr("id contentEditable"),b.popover.remove(),b.handle.remove(),b.dialog.remove()):(a.html(b.editable.html()),b.editor.remove(),a.show())}};a.summernote=a.summernote||{},a.extend(a.summernote,k);var z=new y,A=new x;a.fn.extend({summernote:function(b){if(b=a.extend({},a.summernote.options,b),this.each(function(c,d){var e=a(d);z.createLayout(e,b);var f=z.layoutInfoFromHolder(e);A.attach(f,b),j.isTextarea(e[0])&&e.closest("form").submit(function(){e.val(e.code())})}),this.first().length&&b.focus){var c=z.layoutInfoFromHolder(this.first());c.editable.focus()}return this.length&&b.oninit&&b.oninit(),this},code:function(b){if(void 0===b){var c=this.first();if(!c.length)return;var d=z.layoutInfoFromHolder(c);if(d&&d.editable){var f=d.editor.hasClass("codeview");return f&&e.hasCodeMirror&&d.codable.data("cmEditor").save(),f?d.codable.val():d.editable.html()}return j.isTextarea(c[0])?c.val():c.html()}return this.each(function(c,d){var e=z.layoutInfoFromHolder(a(d));e&&e.editable&&e.editable.html(b)}),this},destroy:function(){return this.each(function(b,c){var d=a(c),e=z.layoutInfoFromHolder(d);if(e&&e.editable){var f=e.editor.data("options");A.dettach(e,f),z.removeLayout(d,e,f)}}),this}})});
});

require.register("sweet-alert", function(exports, require, module) {
// SweetAlert
// 2014 (c) - Tristan Edwards
// github.com/t4t5/sweetalert
(function(window, document) {

  var modalClass   = '.sweet-alert',
      overlayClass = '.sweet-overlay',
      alertTypes   = ['error', 'warning', 'info', 'success'];


  /*
   * Manipulate DOM
   */

  var getModal = function() {
      return document.querySelector(modalClass);
    },
    getOverlay = function() {
      return document.querySelector(overlayClass);
    },
    hasClass = function(elem, className) {
      return new RegExp(' ' + className + ' ').test(' ' + elem.className + ' ');
    },
    addClass = function(elem, className) {
      if (!hasClass(elem, className)) {
        elem.className += ' ' + className;
      }
    },
    removeClass = function(elem, className) {
      var newClass = ' ' + elem.className.replace(/[\t\r\n]/g, ' ') + ' ';
      if (hasClass(elem, className)) {
        while (newClass.indexOf(' ' + className + ' ') >= 0) {
          newClass = newClass.replace(' ' + className + ' ', ' ');
        }
        elem.className = newClass.replace(/^\s+|\s+$/g, '');
      }
    },
    escapeHtml = function(str) {
      var div = document.createElement('div');
      div.appendChild(document.createTextNode(str));
      return div.innerHTML;
    },
    _show = function(elem) {
      elem.style.opacity = '';
      elem.style.display = 'block';
    },
    show = function(elems) {
      if (elems && !elems.length) {
        return _show(elems);
      }
      for (var i = 0; i < elems.length; ++i) {
        _show(elems[i]);
      }
    },
    _hide = function(elem) {
      elem.style.opacity = '';
      elem.style.display = 'none';
    },
    hide = function(elems) {
      if (elems && !elems.length) {
        return _hide(elems);
      }
      for (var i = 0; i < elems.length; ++i) {
        _hide(elems[i]);
      }
    },
    isDescendant = function(parent, child) {
      var node = child.parentNode;
      while (node !== null) {
        if (node === parent) {
          return true;
        }
        node = node.parentNode;
      }
      return false;
    },
    getTopMargin = function(elem) {
      elem.style.left = '-9999px';
      elem.style.display = 'block';

      var height = elem.clientHeight;
      var padding = parseInt(getComputedStyle(elem).getPropertyValue('padding'), 10);

      elem.style.left = '';
      elem.style.display = 'none';
      return ('-' + parseInt(height / 2 + padding) + 'px');
    },
    fadeIn = function(elem, interval) {
      if(+elem.style.opacity < 1) {
        interval = interval || 16;
        elem.style.opacity = 0;
        elem.style.display = 'block';
        var last = +new Date();
        var tick = function() {
          elem.style.opacity = +elem.style.opacity + (new Date() - last) / 100;
          last = +new Date();

          if (+elem.style.opacity < 1) {
            setTimeout(tick, interval);
          }
        };
        tick();
      }
    },
    fadeOut = function(elem, interval) {
      interval = interval || 16;
      elem.style.opacity = 1;
      var last = +new Date();
      var tick = function() {
        elem.style.opacity = +elem.style.opacity - (new Date() - last) / 100;
        last = +new Date();

        if (+elem.style.opacity > 0) {
          setTimeout(tick, interval);
        } else {
          elem.style.display = 'none';
        }
      };
      tick();
    },
    fireClick = function(node) {
      // Taken from http://www.nonobtrusive.com/2011/11/29/programatically-fire-crossbrowser-click-event-with-javascript/
      // Then fixed for today's Chrome browser.
      if (MouseEvent) {
        // Up-to-date approach
        var mevt = new MouseEvent('click', {
          view: window,
          bubbles: false,
          cancelable: true
        });
        node.dispatchEvent(mevt);
      } else if ( document.createEvent ) {
        // Fallback
        var evt = document.createEvent('MouseEvents');
        evt.initEvent('click', false, false);
        node.dispatchEvent(evt);  
      } else if( document.createEventObject ) {
        node.fireEvent('onclick') ;  
      } else if (typeof node.onclick === 'function' ) {
        node.onclick();  
      }
    },
    stopEventPropagation = function(e) {
      // In particular, make sure the space bar doesn't scroll the main window.
      if (typeof e.stopPropagation === 'function') {
        e.stopPropagation();
        e.preventDefault();
      } else if (window.event && window.event.hasOwnProperty('cancelBubble')) {
        window.event.cancelBubble = true;
      }
    };

  // Remember state in cases where opening and handling a modal will fiddle with it.
  var previousActiveElement,
      previousDocumentClick,
      previousWindowKeyDown,
      lastFocusedButton;

  /*
   * Add modal + overlay to DOM
   */

  function initialize() {
    var sweetHTML = '<div class="sweet-overlay" tabIndex="-1"></div><div class="sweet-alert" tabIndex="-1"><div class="icon error"><span class="x-mark"><span class="line left"></span><span class="line right"></span></span></div><div class="icon warning"> <span class="body"></span> <span class="dot"></span> </div> <div class="icon info"></div> <div class="icon success"> <span class="line tip"></span> <span class="line long"></span> <div class="placeholder"></div> <div class="fix"></div> </div> <div class="icon custom"></div> <h2>Title</h2><p>Text</p><button class="cancel" tabIndex="2">Cancel</button><button class="confirm" tabIndex="1">OK</button></div>',
        sweetWrap = document.createElement('div');

    sweetWrap.innerHTML = sweetHTML;

    // For readability: check sweet-alert.html
    document.body.appendChild(sweetWrap);

    // For development use only!
    /*jQuery.ajax({
        url: '../lib/sweet-alert.html', // Change path depending on file location
        dataType: 'html'
      })
      .done(function(html) {
        jQuery('body').append(html);
      });*/
  }



  /*
   * Global sweetAlert function
   */

  window.sweetAlert = window.swal = function() {

    // Default parameters
    var params = {
      title: '',
      text: '',
      type: null,
      allowOutsideClick: false,
      showCancelButton: false,
      closeOnConfirm: true,
      confirmButtonText: 'OK',
      confirmButtonColor: '#AEDEF4',
      cancelButtonText: 'Cancel',
      imageUrl: null,
      imageSize: null
    };

    if (arguments[0] === undefined) {
      window.console.error('sweetAlert expects at least 1 attribute!');
      return false;
    }


    switch (typeof arguments[0]) {

      case 'string':
        params.title = arguments[0];
        params.text  = arguments[1] || '';
        params.type  = arguments[2] || '';

        break;

      case 'object':
        if (arguments[0].title === undefined) {
          window.console.error('Missing "title" argument!');
          return false;
        }

        params.title              = arguments[0].title;
        params.text               = arguments[0].text || params.text;
        params.type               = arguments[0].type || params.type;
        params.allowOutsideClick  = arguments[0].allowOutsideClick || params.allowOutsideClick;
        params.showCancelButton   = arguments[0].showCancelButton !== undefined ? arguments[0].showCancelButton : params.showCancelButton;
        params.closeOnConfirm     = arguments[0].closeOnConfirm !== undefined ? arguments[0].closeOnConfirm : params.closeOnConfirm;

        // Show "Confirm" instead of "OK" if cancel button is visible
        params.confirmButtonText  = (params.showCancelButton) ? 'Confirm' : params.confirmButtonText;

        params.confirmButtonText  = arguments[0].confirmButtonText || params.confirmButtonText;
        params.confirmButtonColor = arguments[0].confirmButtonColor || params.confirmButtonColor;
        params.cancelButtonText   = arguments[0].cancelButtonText || params.cancelButtonText;
        params.imageUrl           = arguments[0].imageUrl || params.imageUrl;
        params.imageSize          = arguments[0].imageSize || params.imageSize;
        params.doneFunction       = arguments[1] || null;

        break;

      default:
        window.console.error('Unexpected type of argument! Expected "string" or "object", got ' + typeof arguments[0]);
        return false;

    }

    //console.log(params.confirmButtonColor);

    setParameters(params);
    fixVerticalPosition();
    openModal();


    // Modal interactions
    var modal = getModal();

    // Mouse interactions
    var onButtonEvent = function(e) {

      var target = e.target || e.srcElement,
          targetedConfirm    = (target.className === 'confirm'),
          modalIsVisible     = hasClass(modal, 'visible'),
          doneFunctionExists = (params.doneFunction && modal.getAttribute('data-has-done-function') === 'true');

      switch (e.type) {
        case ("mouseover"):
          if (targetedConfirm) {
            e.target.style.backgroundColor = colorLuminance(params.confirmButtonColor, -0.04);
          }
          break;
        case ("mouseout"):
          if (targetedConfirm) {
            e.target.style.backgroundColor = params.confirmButtonColor;
          }
          break;
        case ("mousedown"):
          if (targetedConfirm) {
            e.target.style.backgroundColor = colorLuminance(params.confirmButtonColor, -0.14);
          }
          break;
        case ("mouseup"):
          if (targetedConfirm) {
            e.target.style.backgroundColor = colorLuminance(params.confirmButtonColor, -0.04);
          }
          break;
        case ("focus"):
          var $confirmButton = modal.querySelector('button.confirm'),
              $cancelButton  = modal.querySelector('button.cancel');

          if (targetedConfirm) {
            $cancelButton.style.boxShadow = 'none';
          } else {
            $confirmButton.style.boxShadow = 'none';
          }
          break;
        case ("click"):
          if (targetedConfirm && doneFunctionExists && modalIsVisible) {
            params.doneFunction();

            if(params.closeOnConfirm) {
              closeModal();
            }
          } else {
            closeModal();
          }
          
          break;
      }
    };

    var $buttons = modal.querySelectorAll('button');
    for (var i = 0; i < $buttons.length; i++) {
      $buttons[i].onclick     = onButtonEvent;
      $buttons[i].onmouseover = onButtonEvent;
      $buttons[i].onmouseout  = onButtonEvent;
      $buttons[i].onmousedown = onButtonEvent;
      //$buttons[i].onmouseup   = onButtonEvent;
      $buttons[i].onfocus     = onButtonEvent;
    }

    // Remember the current document.onclick event.
    previousDocumentClick = document.onclick;
    document.onclick = function(e) {
      var target = e.target || e.srcElement;

      var clickedOnModal = (modal === target),
          clickedOnModalChild = isDescendant(modal, e.target),
          modalIsVisible = hasClass(modal, 'visible'),
          outsideClickIsAllowed = modal.getAttribute('data-allow-ouside-click') === 'true';

      if (!clickedOnModal && !clickedOnModalChild && modalIsVisible && outsideClickIsAllowed) {
        closeModal();
      }
    };


    // Keyboard interactions
    var $okButton = modal.querySelector('button.confirm'),
        $cancelButton = modal.querySelector('button.cancel'),
        $modalButtons = modal.querySelectorAll('button:not([type=hidden])');


    function handleKeyDown(e) {
      var keyCode = e.keyCode || e.which;

      if ([9,13,32,27].indexOf(keyCode) === -1) {
        // Don't do work on keys we don't care about.
        return;
      }

      var $targetElement = e.target || e.srcElement;

      var btnIndex = -1; // Find the button - note, this is a nodelist, not an array.
      for (var i = 0; i < $modalButtons.length; i++) {
        if ($targetElement === $modalButtons[i]) {
          btnIndex = i;
          break;
        }
      }

      if (keyCode === 9) {
        // TAB
        if (btnIndex === -1) {
          // No button focused. Jump to the confirm button.
          $targetElement = $okButton;
        } else {
          // Cycle to the next button
          if (btnIndex === $modalButtons.length - 1) {
            $targetElement = $modalButtons[0];
          } else {
            $targetElement = $modalButtons[btnIndex + 1];
          }
        }

        stopEventPropagation(e);
        $targetElement.focus();
        setFocusStyle($targetElement, params.confirmButtonColor); // TODO

      } else {
        if (keyCode === 13 || keyCode === 32) {
            if (btnIndex === -1) {
              // ENTER/SPACE clicked outside of a button.
              $targetElement = $okButton;
            } else {
              // Do nothing - let the browser handle it.
              $targetElement = undefined;
            }
        } else if (keyCode === 27 && !($cancelButton.hidden || $cancelButton.style.display === 'none')) {
          // ESC to cancel only if there's a cancel button displayed (like the alert() window).
          $targetElement = $cancelButton;
        } else {
          // Fallback - let the browser handle it.
          $targetElement = undefined;
        }

        if ($targetElement !== undefined) {
          fireClick($targetElement, e);
        }
      }
    }

    previousWindowKeyDown = window.onkeydown;
    window.onkeydown = handleKeyDown;

    function handleOnBlur(e) {
      var $targetElement = e.target || e.srcElement,
          $focusElement = e.relatedTarget,
          modalIsVisible = hasClass(modal, 'visible');

      if (modalIsVisible) {
        var btnIndex = -1; // Find the button - note, this is a nodelist, not an array.

        if ($focusElement !== null) {
          // If we picked something in the DOM to focus to, let's see if it was a button.
          for (var i = 0; i < $modalButtons.length; i++) {
            if ($focusElement === $modalButtons[i]) {
              btnIndex = i;
              break;
            }
          }

          if (btnIndex === -1) {
            // Something in the dom, but not a visible button. Focus back on the button.
            $targetElement.focus();
          }
        } else {
          // Exiting the DOM (e.g. clicked in the URL bar);
          lastFocusedButton = $targetElement;
        }
      }
    }

    $okButton.onblur = handleOnBlur;
    $cancelButton.onblur = handleOnBlur;

    window.onfocus = function() {
      // When the user has focused away and focused back from the whole window.
      window.setTimeout(function() {
        // Put in a timeout to jump out of the event sequence. Calling focus() in the event
        // sequence confuses things.
        if (lastFocusedButton !== undefined) {
          lastFocusedButton.focus();
          lastFocusedButton = undefined;
        }        
      }, 0);
    };
  };


  /*
   * Set type, text and actions on modal
   */

  function setParameters(params) {
    var modal = getModal();

    var $title = modal.querySelector('h2'),
        $text = modal.querySelector('p'),
        $cancelBtn = modal.querySelector('button.cancel'),
        $confirmBtn = modal.querySelector('button.confirm');

    // Title
    $title.innerHTML = escapeHtml(params.title).split("\n").join("<br>");

    // Text
    $text.innerHTML = escapeHtml(params.text || '').split("\n").join("<br>");
    if (params.text) {
      show($text);
    }

    // Icon
    hide(modal.querySelectorAll('.icon'));
    if (params.type) {
      var validType = false;
      for (var i = 0; i < alertTypes.length; i++) {
        if (params.type === alertTypes[i]) {
          validType = true;
          break;
        }
      }
      if (!validType) {
        window.console.error('Unknown alert type: ' + params.type);
        return false;
      }
      var $icon = modal.querySelector('.icon.' + params.type);
      show($icon);

      // Animate icon
      switch (params.type) {
        case "success":
          addClass($icon, 'animate');
          addClass($icon.querySelector('.tip'), 'animateSuccessTip');
          addClass($icon.querySelector('.long'), 'animateSuccessLong');
          break;
        case "error":
          addClass($icon, 'animateErrorIcon');
          addClass($icon.querySelector('.x-mark'), 'animateXMark');
          break;
        case "warning":
          addClass($icon, 'pulseWarning');
          addClass($icon.querySelector('.body'), 'pulseWarningIns');
          addClass($icon.querySelector('.dot'), 'pulseWarningIns');
          break;
      }

    }

    // Custom image
    if (params.imageUrl) {
      var $customIcon = modal.querySelector('.icon.custom');

      $customIcon.style.backgroundImage = 'url(' + params.imageUrl + ')';
      show($customIcon);

      var _imgWidth  = 80,
          _imgHeight = 80;

      if (params.imageSize) {
        var imgWidth  = params.imageSize.split('x')[0];
        var imgHeight = params.imageSize.split('x')[1];

        if (!imgWidth || !imgHeight) {
          window.console.error("Parameter imageSize expects value with format WIDTHxHEIGHT, got " + params.imageSize);
        } else {
          _imgWidth  = imgWidth;
          _imgHeight = imgHeight;

          $customIcon.css({
            'width': imgWidth + 'px',
            'height': imgHeight + 'px'
          });
        }
      }
      $customIcon.setAttribute('style', $customIcon.getAttribute('style') + 'width:' + _imgWidth + 'px; height:' + _imgHeight + 'px');
    }

    // Cancel button
    modal.setAttribute('data-has-cancel-button', params.showCancelButton);
    if (params.showCancelButton) {
      $cancelBtn.style.display = 'inline-block';
    } else {
      hide($cancelBtn);
    }

    // Edit text on cancel and confirm buttons
    if (params.cancelButtonText) {
      $cancelBtn.innerHTML = escapeHtml(params.cancelButtonText);
    }
    if (params.confirmButtonText) {
      $confirmBtn.innerHTML = escapeHtml(params.confirmButtonText);
    }

    // Set confirm button to selected background color
    $confirmBtn.style.backgroundColor = params.confirmButtonColor;

    // Set box-shadow to default focused button
    setFocusStyle($confirmBtn, params.confirmButtonColor);

    // Allow outside click?
    modal.setAttribute('data-allow-ouside-click', params.allowOutsideClick);

    // Done-function
    var hasDoneFunction = (params.doneFunction) ? true : false;
    modal.setAttribute('data-has-done-function', hasDoneFunction);
  }


  /*
   * Set hover, active and focus-states for buttons (source: http://www.sitepoint.com/javascript-generate-lighter-darker-color)
   */
   
  function colorLuminance(hex, lum) {
    // Validate hex string
    hex = String(hex).replace(/[^0-9a-f]/gi, '');
    if (hex.length < 6) {
      hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    }
    lum = lum || 0;

    // Convert to decimal and change luminosity
    var rgb = "#", c, i;
    for (i = 0; i < 3; i++) {
      c = parseInt(hex.substr(i*2,2), 16);
      c = Math.round(Math.min(Math.max(0, c + (c * lum)), 255)).toString(16);
      rgb += ("00"+c).substr(c.length);
    }

    return rgb;
  }

  function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? parseInt(result[1], 16) + ', ' + parseInt(result[2], 16) + ', ' + parseInt(result[3], 16) : null;
  }

  // Add box-shadow style to button (depending on its chosen bg-color)
  function setFocusStyle($button, bgColor) {
    var rgbColor = hexToRgb(bgColor);
    $button.style.boxShadow = '0 0 2px rgba(' + rgbColor +', 0.8), inset 0 0 0 1px rgba(0, 0, 0, 0.05)';
  }



  /*
   * Animations
   */

  function openModal() {
    var modal = getModal();
    fadeIn(getOverlay(), 10);
    show(modal);
    addClass(modal, 'showSweetAlert');
    removeClass(modal, 'hideSweetAlert');

    previousActiveElement = document.activeElement;
    var $okButton = modal.querySelector('button.confirm');
    $okButton.focus();

    setTimeout(function() {
      addClass(modal, 'visible');
    }, 500);
  }

  function closeModal() {
    var modal = getModal();
    fadeOut(getOverlay(), 5);
    fadeOut(modal, 5);
    removeClass(modal, 'showSweetAlert');
    addClass(modal, 'hideSweetAlert');
    removeClass(modal, 'visible');


    // Reset icon animations

    var $successIcon = modal.querySelector('.icon.success');
    removeClass($successIcon, 'animate');
    removeClass($successIcon.querySelector('.tip'), 'animateSuccessTip');
    removeClass($successIcon.querySelector('.long'), 'animateSuccessLong');

    var $errorIcon = modal.querySelector('.icon.error');
    removeClass($errorIcon, 'animateErrorIcon');
    removeClass($errorIcon.querySelector('.x-mark'), 'animateXMark');

    var $warningIcon = modal.querySelector('.icon.warning');
    removeClass($warningIcon, 'pulseWarning');
    removeClass($warningIcon.querySelector('.body'), 'pulseWarningIns');
    removeClass($warningIcon.querySelector('.dot'), 'pulseWarningIns');


    // Reset the page to its previous state
    window.onkeydown = previousWindowKeyDown;
    document.onclick = previousDocumentClick;
    if (previousActiveElement) {
      previousActiveElement.focus();
    }
    lastFocusedButton = undefined;
  }


  /*
   * Set "margin-top"-property on modal based on its computed height
   */

  function fixVerticalPosition() {
    var modal = getModal();

    modal.style.marginTop = getTopMargin(getModal());
  }



  /*
   * If library is injected after page has loaded
   */

  (function () {
	  if (document.readyState === "complete" || document.readyState === "interactive") {
		  initialize();
	  } else {
		  if (document.addEventListener) {
			  document.addEventListener('DOMContentLoaded', function factorial() {
				  document.removeEventListener('DOMContentLoaded', arguments.callee, false);
				  initialize();
			  }, false);
		  } else if (document.attachEvent) {
			  document.attachEvent('onreadystatechange', function() {
				  if (document.readyState === 'complete') {
					  document.detachEvent('onreadystatechange', arguments.callee);
					  initialize();
				  }
			  });
		  }
	  }
  })();

})(window, document);

});

require.register("table", function(exports, require, module) {
//var Table = FixedDataTable.Table;
//var Column = FixedDataTable.Column;
var DatePair = require("date_pair")
var SearchBar = require("search_bar")
var RangeSlider = require("range_slider")
var CheckboxGroup = require("checkbox_group")
//var TagsInput = require("react-tagsinput")

var BlazeColumn = React.createClass({displayName: 'BlazeColumn',
  render: function() {
    return (
      React.createElement("div", null, 
        React.createElement("br", null), 
        "Columns", 
        React.createElement("br", null), 
        React.createElement("h6", null, "Date Pair"), 
          React.createElement(DatePair, null), 
        React.createElement("h6", null, "Search (tags)"), 
          React.createElement(SearchBar, null), 
        React.createElement("h6", null, "Range Slider"), 
          React.createElement(RangeSlider, null), 
        React.createElement("h6", null, "Checkbox Group"), 
          React.createElement(CheckboxGroup, null)
      )
    )
  }
})

var BlazeTable = React.createClass({displayName: 'BlazeTable',
  getInitialState: function() {
    return {
      rows: [
        ['a1', 'b1', 'c1'],
        ['a2', 'b3', 'c2'],
        ['a3', 'b3', 'c3'],
      ]
    }
  },
  rowGetter: function (rowIndex) {
    return this.state.rows[rowIndex];
  },
  render: function() {
    var rowGetter = this.rowGetter
    // TODO 
    // get column names
    // get default data
    return( 
      React.createElement("div", {style: {marginLeft:30}}, 
        React.createElement("br", null), 
        React.createElement(Table, {
          rowHeight: 50, 
          rowGetter: rowGetter, 
          rowsCount: this.state.rows.length, 
          width: 500, 
          height: 200, 
          headerHeight: 50}, 
          React.createElement(Column, {
            label: "Col 1", 
            width: 300, 
            dataKey: 0}
          ), 
          React.createElement(Column, {
            label: "Col 2", 
            width: 200, 
            dataKey: 1}
          )
        )
      )
    )
  }
})

var DataExplorer = React.createClass({displayName: 'DataExplorer',
  render: function() {
    return (
      React.createElement("div", {className: "row"}, 
        React.createElement("div", {className: "col-md-2", style: {paddingRight:0}}, React.createElement(BlazeColumn, null), " "), 
        React.createElement("div", {className: "col-md-10"}, React.createElement(BlazeTable, null), " ")
      )
    )
  }
})

module.exports = DataExplorer

});

;require.register("user_dataset_table", function(exports, require, module) {
var UserDatasetTable = React.createClass({displayName: 'UserDatasetTable',
  render: function() {
    return (
      React.createElement("div", null, 
        React.createElement("br", null), 
        React.createElement("br", null), 
        React.createElement("div", {className: "section-title"}, "Datasets"), 
        React.createElement("br", null), 
        React.createElement("a", {href: "#/new_dataset", className: "btn btn-success btn-lg", 
          style: {float:"right",marginTop:-65}}, 
          "Add Dataset"
        ), 
        React.createElement("table", {className: "table table-hover dataset-table"}, 
          React.createElement("thead", null, 
            React.createElement("tr", {className: "header-row"}, 
              React.createElement("th", null), 
              React.createElement("th", null, "Type "), 
              React.createElement("th", null, "Name "), 
              React.createElement("th", null, "Shape "), 
              React.createElement("th", null, "URL "), 
              React.createElement("th", null, "Date Added "), 
              React.createElement("th", null, "Collaborators ")
            )
          ), 
          React.createElement("tbody", null, 
            React.createElement("tr", null, 
              React.createElement("td", {style: {textAlign:"center"}}, 
                  React.createElement("div", {style: {display:"inline-block",
                               backgroundColor:"#15CD72",
                              height:10,width:10,borderRadius:5}})), 
              React.createElement("td", null, "Type "), 
              React.createElement("td", null, "Name "), 
              React.createElement("td", null, "Shape "), 
              React.createElement("td", null, "URL "), 
              React.createElement("td", null, "Date Added "), 
              React.createElement("td", null, "Collaborators ")
            ), 
            React.createElement("tr", null, 
              React.createElement("td", {style: {textAlign:"center"}}, 
                  React.createElement("div", {style: {display:"inline-block",
                               backgroundColor:"#15CD72",
                              height:10,width:10,borderRadius:5}})), 
              React.createElement("td", null, "Type "), 
              React.createElement("td", null, "Name "), 
              React.createElement("td", null, "Shape "), 
              React.createElement("td", null, "URL "), 
              React.createElement("td", null, "Date Added "), 
              React.createElement("td", null, "Collaborators ")
            )
          )
          
        )
      )
    )
  }
})
module.exports = UserDatasetTable

});

;require.register("youtube_row", function(exports, require, module) {
var YoutubeRow = React.createClass({displayName: 'YoutubeRow',
  render: function() {
    return (
      React.createElement("tr", null, 
        React.createElement("td", {style: {paddingRight:20,paddingTop:15}}, 
          React.createElement("a", {href: "#", className: "thumbnail", style: {width:50,padding:0}}, 
            React.createElement("img", {src: this.props.row.profile_pic, style: {height:50,width:50}})
          )
        ), 
          React.createElement("td", {style: {width:"25%"}}, this.props.row.description), 
          React.createElement("td", {style: {width:"25%"}}, 
            React.createElement("a", {href: this.props.row.profile_url}, 
              this.props.row.profile_url)
          ), 
          React.createElement("td", {style: {width:"25%"}}, this.props.row.followers), 
          React.createElement("td", {style: {width:"25%"}}, this.props.row.following), 
          React.createElement("td", {style: {width:"25%"}}, 
            React.createElement("a", {href: "#"}, React.createElement("i", {className: "fa fa-external-link-square"}))
          )
      )
    )
  }
})

module.exports = YoutubeRow

});

;
//# sourceMappingURL=app.js.map