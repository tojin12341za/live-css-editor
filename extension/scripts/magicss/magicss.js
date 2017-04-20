/*globals jQuery, less, utils, sourceMap, extLib, chrome */

(function($){
    if (window.MagiCSSEditor) {
        window.MagiCSSEditor.reposition();      // 'Magic CSS window is already there. Repositioning it.'
        return;
    }

    // for HTML frameset pages, this value would be 'FRAMESET'
    // chrome.tabs.executeScript uses allFrames: true, to run inside all frames
    if (document.body.tagName !== 'BODY') {
        return;
    }

    window.existingCSSSelectors = (function () {
        var selectorsOb = {};
        try {
            var styleSheets = document.styleSheets;
            var getCSSSelectorsRecursively = function (cssRules, includeMediaTitle) {
                var cssSelectors = [];
                for (var i = 0; i < cssRules.length; i++) {
                    var cssRule = cssRules[i] || {};
                    if (cssRule.selectorText) {
                        var selectorsFound = cssRule.selectorText.split(', ');
                        for (var j = 0; j < selectorsFound.length; j++) {
                            cssSelectors.push(selectorsFound[j]);
                        }
                    }
                    if (includeMediaTitle && cssRule instanceof CSSMediaRule) {
                        cssSelectors.push(cssRule.cssText.substring(0, cssRule.cssText.indexOf('{')).trim());
                    }
                    if (cssRule.cssRules) {
                        cssSelectors = cssSelectors.concat(getCSSSelectorsRecursively(cssRule.cssRules, includeMediaTitle));
                    }
                }
                return cssSelectors;
            };
            for (var i = 0; i < styleSheets.length; i++) {
                var styleSheet = styleSheets[i];
                var cssRules = (styleSheet || {}).cssRules || [];
                var cssSelectors = getCSSSelectorsRecursively(cssRules, true);
                cssSelectors = cssSelectors.sort();
                cssSelectors.forEach(function (cssSelector) {
                    selectorsOb[cssSelector] = true;
                });
            }
        } catch (e) {
            if (e.name === 'SecurityError') {   // This may happen due to cross-domain CSS resources
                // do nothing
            } else {
                console.log(
                    'If you are seeing this message, it means that Magic CSS extension encountered an unexpected error' +
                    ' when trying to read the list of existing CSS selectors.' +
                    '\n\nDon\'t worry :-) This would not cause any issue at all in usage of this extension.' +
                    ' But we would be glad if you report about this error message at https://github.com/webextensions/live-css-editor/issues' +
                    ' so that we can investigate this minor bug and provide better experience for you and other web developers.'
                );
            }
            return {};
        }

        return selectorsOb;
    }());

    var isChrome = /Chrome/.test(navigator.userAgent),
        isFirefox = /Firefox/.test(navigator.userAgent);

    var strCreatedVia = 'Created via Magic CSS extension';
    if (isChrome) {
        strCreatedVia += ' for Chrome - https://chrome.google.com/webstore/detail/ifhikkcafabcgolfjegfcgloomalapol';
    } else if (isFirefox) {
        strCreatedVia += ' for Firefox';
    }
    var createGist = function (text, cb) {
        $.ajax({
            url: 'https://api.github.com/gists',
            type: 'POST',
            timeout: 20000,
            contentType: 'application/json',
            data: JSON.stringify({
                "description": window.location.origin + ' - via Magic CSS' + (function () {
                    if (isChrome) {
                        return ' extension for Chrome';
                    } else if (isFirefox) {
                        return ' extension for Firefox';
                    }
                }()),
                "public": true,
                "files": {
                    "styles.css": {
                        "content": text + '\r\n\r\n/* ' + strCreatedVia + ' */\r\n'
                    }
                }
            }),
            error: function () {
                utils.alertNote('An unexpected error has occured.<br />We could not reach GitHub Gist.', 10000);
            },
            success: function (json, textStatus) {
                if (textStatus === 'success') {
                    cb(json.html_url);
                } else {
                    utils.alertNote('An unexpected error has occured.<br />We could not access GitHub Gist.', 10000);
                }
            }
        });
    };
    var createGistAndEmail = (function () {
        var lastMailedValue = null,
            lastSuccessNote = '';
        return function (text) {
            text = $.trim(text);
            if (text === '') {
                utils.alertNote('Please type some code to be shared', 5000);
            } else if (lastMailedValue === text) {
                utils.alertNote(lastSuccessNote, 20000);
            } else {
                var wishToContinue = window.confirm('The code you have entered would be uploaded to\n        https://gist.github.com/\nand a link would be generated for sharing.\n\nDo you wish to continue?');
                if (!wishToContinue) {
                    return;
                }
                createGist(text, function (gistUrl) {
                    var anchor = '<a target="_blank" href="' + gistUrl + '">' + gistUrl + '</a>';
                    lastMailedValue = text;
                    lastSuccessNote = 'The GitHub Gist was successfully created: ' +
                        anchor +
                        '<br/>Share code: <a href="' + 'mailto:?subject=Use this code for styling - ' + gistUrl + '&body=' +
                        encodeURIComponent(text.replace(/\t/g,'  ').substr(0,140) + '\r\n...\r\n...\r\n\r\n' + gistUrl + '\r\n\r\n-- ' + strCreatedVia + '') +
                        '">Send e-mail</a>';
                    utils.alertNote(lastSuccessNote, 10000);
                });
                utils.alertNote('Request initiated. It might take a few moments. Please wait.', 5000);
            }
        };
    }());

    var showCSSSelectorMatches = function (cssSelector, editor) {
        if (!cssSelector) {
            utils.alertNote.hide();
        }

        if (!editor.styleHighlightingSelector) {
            editor.styleHighlightingSelector = new utils.StyleTag({
                id: 'magicss-higlight-by-selector',
                parentTag: 'body',
                overwriteExistingStyleTagWithSameId: true
            });
        }

        if (cssSelector) {
            editor.styleHighlightingSelector.cssText = cssSelector + '{outline: 1px dashed red !important;}';
        } else {
            editor.styleHighlightingSelector.cssText = '';
        }
        editor.styleHighlightingSelector.applyTag();

        if (cssSelector) {
            var count;

            try {
                count = $(cssSelector).length;
            } catch (e) {
                return '';
            }

            var trunc = function (str, limit) {
                if (str.length > limit) {
                    var separator = ' ... ';
                    str = str.substr(0, limit / 2) + separator + str.substr(separator.length + str.length - limit / 2);
                }
                return str;
            };

            if (count) {
                utils.alertNote(trunc(cssSelector, 100) + '&nbsp; &nbsp;<span style="font-weight:normal;">(' + count + ' match' + ((count === 1) ? '':'es') + ')</span>', 2500);
            } else {
                utils.alertNote(trunc(cssSelector, 100) + '&nbsp; &nbsp;<span style="font-weight:normal;">(No matches)</span>', 2500);
            }
        }
    };

    var setCodeMirrorCSSLinting = function (cm, enableOrDisable) {
        var lint,
            gutters = [].concat(cm.getOption('gutters') || []);
        if (enableOrDisable === 'enable') {
            lint = true;
            gutters.push('CodeMirror-lint-markers');
        } else {
            lint = false;
            var index = gutters.indexOf('CodeMirror-lint-markers');
            if (index > -1) {
                gutters.splice(index, 1);
            }
        }
        cm.setOption('gutters', gutters);
        cm.setOption('lint', lint);
    };

    var enableAutocompleteSelectors = function (editor) {
        $(editor.container).removeClass('magicss-autocomplete-selectors-disabled').addClass('magicss-autocomplete-selectors-enabled');
        editor.userPreference('autocomplete-selectors', 'enabled');
    };
    var disableAutocompleteSelectors = function (editor) {
        $(editor.container).removeClass('magicss-autocomplete-selectors-enabled').addClass('magicss-autocomplete-selectors-disabled');
        editor.userPreference('autocomplete-selectors', 'disabled');
    };

    var highlightErroneousLineTemporarily = function (editor, errorInLine) {
        var lineHandle = editor.cm.addLineClass(errorInLine, 'background', 'line-has-less-error-transition-effect');
        editor.cm.addLineClass(errorInLine, 'background', 'line-has-less-error');
        var duration = 2000;
        setTimeout(function () {
            editor.cm.removeLineClass(lineHandle, 'background', 'line-has-less-error');
            setTimeout(function () {
                editor.cm.removeLineClass(lineHandle, 'background', 'line-has-less-error-transition-effect');
            }, 500);   /* 500ms delay matches the transition duration specified for the CSS selector ".line-has-less-error-transition-effect" */
        }, duration);
    };

    var isMac = false;
    try {
        isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    } catch (e) {
        // do nothing
    }

    var noteForUndo = '<br />Note: You may press ' + (isMac ? 'Cmd' : 'Ctrl') + ' + Z to undo the change';

    var main = function () {
        utils.delayFunctionUntilTestFunction({
            tryLimit: 100,
            waitFor: 500,
            fnTest: function () {
                if ((window.Editor || {}).usable) {
                    return true;
                }
                return false;
            },
            fnFirstFailure: function () {
                // do nothing
            },
            fnFailure: function () {
                // do nothing
            },
            fnSuccess: function () {
                // Don't let mouse scroll on CodeMirror hints pass on to the parent elements
                // http://stackoverflow.com/questions/5802467/prevent-scrolling-of-parent-element/16324762#16324762
                $(document).on('DOMMouseScroll mousewheel', '.CodeMirror-hints', function(ev) {
                    var $this = $(this),
                        scrollTop = this.scrollTop,
                        scrollHeight = this.scrollHeight,
                        height = $this.innerHeight(),
                        delta = (ev.type == 'DOMMouseScroll' ?
                            ev.originalEvent.detail * -40 :
                            ev.originalEvent.wheelDelta),
                        up = delta > 0;

                    var prevent = function() {
                        ev.stopPropagation();
                        ev.preventDefault();
                        ev.returnValue = false;
                        return false;
                    };

                    if (!up && -delta > scrollHeight - height - scrollTop) {
                        // Scrolling down, but this will take us past the bottom.
                        $this.scrollTop(scrollHeight);
                        return prevent();
                    } else if (up && delta > scrollTop) {
                        // Scrolling up, but this will take us past the top.
                        $this.scrollTop(0);
                        return prevent();
                    }
                });

                var smc;

                var id = 'MagiCSS-bookmarklet',
                    newStyleTagId = id + '-html-id',
                    newStyleTag = new utils.StyleTag({
                        id: newStyleTagId,
                        parentTag: 'body',
                        overwriteExistingStyleTagWithSameId: true
                    });

                var fnApplyTextAsCSS = function (editor) {
                    if (getLanguageMode() === 'less') {
                        var lessCode = editor.getTextValue(),
                            lessOptions = { sourceMap: true };

                        less.render(lessCode, lessOptions, function(err, output) {
                            smc = null;     // Unset old SourceMapConsumer

                            if (err) {
                                // FIXME: The following setTimeout is a temporary fix for alertNote getting hidden by 'delayedcursormove()'
                                setTimeout(function () {
                                    utils.alertNote(
                                        'Invalid LESS syntax.' +
                                        '<br />Error in line: ' + err.line + ' column: ' + err.column +
                                        '<br />Error message: ' + err.message,
                                        10000
                                    );
                                    highlightErroneousLineTemporarily(editor, err.line - 1);
                                }, 0);
                            } else {
                                var strCssCode = output.css;
                                newStyleTag.cssText = strCssCode;
                                newStyleTag.applyTag();
                                var rawSourceMap = output.map;
                                if (rawSourceMap) {
                                    smc = new sourceMap.SourceMapConsumer(rawSourceMap);
                                }
                            }
                        });
                    } else {
                        var cssCode = editor.getTextValue();
                        newStyleTag.cssText = cssCode;
                        newStyleTag.applyTag();
                    }
                };

                var setLanguageMode = function (languageMode, editor) {
                    if (languageMode === 'less') {
                        $(editor.container).removeClass('magicss-selected-mode-css').addClass('magicss-selected-mode-less');
                        editor.userPreference('language-mode', 'less');
                        setCodeMirrorCSSLinting(editor.cm, 'disable');
                        utils.alertNote('Now editing code in LESS mode', 5000);
                    } else {
                        $(editor.container).removeClass('magicss-selected-mode-less').addClass('magicss-selected-mode-css');
                        editor.userPreference('language-mode', 'css');
                        utils.alertNote('Now editing code in CSS mode', 5000);
                    }
                    fnApplyTextAsCSS(editor);
                };

                var getLanguageMode = function () {
                    return $('#' + id).hasClass('magicss-selected-mode-css') ? 'css' : 'less';
                };

                var options = {
                    id: id,
                    title: function ($, editor) {
                        var $outer = $('<div></div>'),
                            $titleItems = $('<div class="magicss-title"></div>');
                        $outer.append($titleItems);
                        $titleItems.append(
                            '<div class="magicss-mode-button magicss-mode-less" title="LESS mode">less</div>' +
                            '<div class="magicss-mode-button magicss-mode-switch" title="Switch mode"><div class="magicss-mode-switch-selected"></div></div>' +
                            '<div class="magicss-mode-button magicss-mode-css" title="CSS mode">css</div>'
                        );

                        $(document).on('click', '.magicss-mode-css', function () {
                            setLanguageMode('css', editor);
                        });
                        $(document).on('click', '.magicss-mode-less', function () {
                            setLanguageMode('less', editor);
                        });
                        $(document).on('click', '.magicss-mode-switch', function () {
                            if ($('#' + id).hasClass('magicss-selected-mode-css')) {
                                setLanguageMode('less', editor);
                            } else {
                                setLanguageMode('css', editor);
                            }
                        });

                        return $outer;
                    },
                    placeholder: 'Shortcut: Alt + Shift + C' + '\n\nWrite your LESS/CSS code here.\nThe code gets applied immediately.\n\nExample:' + '\nimg {\n    opacity: 0.5;\n}',
                    codemirrorOptions: {
                        mode: 'text/x-less',
                        colorpicker: {
                            mode: 'edit'
                        },
                        autoCloseBrackets: true,
                        hintOptions: {
                            completeSingle: false,
                            // closeCharacters: /[\s()\[\]{};:>,]/,     // This is the default value defined in show-hint.js
                            closeCharacters: /[(){};:,]/,               // Custom override
                            onAddingAutoCompleteOptionsForSelector: function (add) {
                                var editor = window.MagiCSSEditor;
                                if (editor.userPreference('autocomplete-selectors') === 'disabled') {
                                    return;
                                }
                                if (window.existingCSSSelectors) {
                                    add(window.existingCSSSelectors, true);
                                }
                            },
                            onCssHintSelectForSelector: function (selectedText) {
                                var editor = window.MagiCSSEditor;
                                showCSSSelectorMatches(selectedText, editor);
                            },
                            onCssHintShownForSelector: function () {    // As per current CodeMirror/css-hint architecture,
                                                                        // "select" is called before "shown".
                                                                        // The "select" operation would also show the number  e are hiding the alertNote
                                utils.alertNote.hide();
                            }
                        },
                        extraKeys: {
                            'Ctrl-S': function () {
                                var editor = window.MagiCSSEditor;
                                createGistAndEmail(editor.getTextValue());
                                editor.focus();
                            },
                            'Ctrl-D': function () {
                                // TODO: Implement select-next-occurrence-of-current-selection
                                //       This link might be of some help: https://codereview.chromium.org/219583002/
                            }
                        }
                    },
                    bgColor: '68,88,174,0.7',
                    headerIcons: [
                        {
                            name: 'beautify',
                            title: 'Beautify code',
                            cls: 'magicss-beautify magicss-gray-out',
                            onclick: function (evt, editor) {
                                var textValue = editor.getTextValue(),
                                    beautifiedCSS = utils.beautifyCSS(textValue);
                                if (textValue.trim() !== beautifiedCSS.trim()) {
                                    editor.setTextValue(beautifiedCSS).reInitTextComponent({pleaseIgnoreCursorActivity: true});
                                    utils.alertNote('Your code has been beautified :-)', 5000);
                                } else {
                                    utils.alertNote('Your code already looks beautiful :-)', 5000);
                                }
                                editor.focus();
                            }
                        },
                        {
                            name: 'disable',
                            title: 'Deactivate code',
                            cls: 'magicss-disable-css magicss-gray-out',
                            onclick: function (evt, editor, divIcon) {
                                if ($(divIcon).parents('#' + id).hasClass('indicate-disabled')) {
                                    editor.disableEnableCSS('enable');
                                } else {
                                    editor.disableEnableCSS('disable');
                                }
                            },
                            afterrender: function (editor, divIcon) {
                                /* HACK: Remove this hack which is being used to handle "divIcon.title" change
                                         for the case of "editor.disableEnableCSS('disable')" under "reInitialized()" */
                                editor.originalDisableEnableCSS = editor.disableEnableCSS;
                                editor.disableEnableCSS = function (doWhat) {
                                    editor.originalDisableEnableCSS(doWhat);
                                    if (doWhat === 'disable') {
                                        divIcon.title = 'Activate code';
                                    } else {
                                        divIcon.title = 'Deactivate code';
                                    }
                                };
                            }
                        },
                        (function () {
                            if (!isChrome) {
                                return null;
                            }
                            if (executionCounter < 25 || 50 <= executionCounter) {
                                return null;
                            } else {
                                return {
                                    name: 'rate-on-webstore',
                                    title: 'Rate us on Chrome Web Store',
                                    cls: 'magicss-rate-on-webstore',
                                    href: 'https://chrome.google.com/webstore/detail/ifhikkcafabcgolfjegfcgloomalapol/reviews'
                                };
                            }
                        }())
                    ],
                    headerOtherIcons: [
                        {
                            name: 'less-to-css',
                            title: 'Convert this code from LESS to CSS',
                            uniqCls: 'magicss-less-to-css',
                            onclick: function (evt, editor) {
                                if (getLanguageMode() === 'less') {
                                    var lessCode = editor.getTextValue();
                                    utils.lessToCSS(lessCode, function (err, cssCode) {
                                        if (err) {
                                            utils.alertNote(
                                                'Invalid LESS syntax.' +
                                                '<br />Error in line: ' + err.line + ' column: ' + err.column +
                                                '<br />Error message: ' + err.message,
                                                10000
                                            );
                                            highlightErroneousLineTemporarily(editor, err.line - 1);
                                            editor.setCursor({line: err.line - 1, ch: err.column}, {pleaseIgnoreCursorActivity: true});
                                        } else {
                                            var beautifiedLessCode = utils.beautifyCSS(utils.minifyCSS(lessCode));
                                            cssCode = utils.beautifyCSS(utils.minifyCSS(cssCode));

                                            if (cssCode === beautifiedLessCode) {
                                                utils.alertNote('Your code is already in CSS', 5000);
                                            } else {
                                                editor.setTextValue(cssCode).reInitTextComponent({pleaseIgnoreCursorActivity: true});
                                                utils.alertNote('Your code has been converted from LESS to CSS :-)' + noteForUndo, 5000);
                                            }
                                        }
                                        editor.focus();
                                    });
                                } else {
                                    utils.alertNote('Please switch to editing code in LESS mode to enable this feature', 5000);
                                    editor.focus();
                                }
                            },
                            beforeShow: function (origin, tooltip, editor) {
                                tooltip.addClass(getLanguageMode() === 'less' ? 'tooltipster-selected-mode-less' : 'tooltipster-selected-mode-css')
                                       .addClass(editor.cm.getOption('lineNumbers') ? 'tooltipster-line-numbers-enabled' : 'tooltipster-line-numbers-disabled')
                                       .addClass(editor.cm.getOption('lint') ? 'tooltipster-css-linting-enabled' : 'tooltipster-css-linting-disabled')
                                       .addClass(editor.userPreference('autocomplete-selectors') === 'disabled' ? 'tooltipster-autocomplete-selectors-disabled' : 'tooltipster-autocomplete-selectors-enabled');
                            }
                        },
                        /*
                        {
                            name: 'css-to-less',
                            title: 'Convert this code from CSS to LESS',
                            uniqCls: 'magicss-css-to-less',
                            onclick: function () {
                                console.log('Step 1. Read the text');
                                console.log('Step 2. Try to convert that text from CSS to LESS');
                                console.log('Step 3. If successful, change editing mode from CSS to LESS');
                                console.log('Step 4. Notify the user about this change');
                            },
                            beforeShow: function (origin, tooltip) {
                                if (getLanguageMode() === 'css') {
                                    tooltip.addClass('tooltipster-selected-mode-css');
                                }
                            }
                        },
                        /* */
                        {
                            name: 'showLineNumbers',
                            title: 'Show line numbers',
                            uniqCls: 'magicss-show-line-numbers',
                            onclick: function (evt, editor) {
                                editor.cm.setOption('lineNumbers', true);
                                editor.focus();
                            }
                        },
                        {
                            name: 'hideLineNumbers',
                            title: 'Hide line numbers',
                            uniqCls: 'magicss-hide-line-numbers',
                            onclick: function (evt, editor) {
                                editor.cm.setOption('lineNumbers', false);
                                editor.focus();
                            }
                        },
                        {
                            name: 'enableCSSLinting',
                            title: 'Enable CSS linting',
                            uniqCls: 'magicss-enable-css-linting',
                            onclick: function (evt, editor) {
                                if (getLanguageMode() === 'css') {
                                    setCodeMirrorCSSLinting(editor.cm, 'enable');
                                } else {
                                    utils.alertNote('Please switch to editing code in CSS mode to enable this feature', 5000);
                                }
                                editor.focus();
                            }
                        },
                        {
                            name: 'disableCSSLinting',
                            title: 'Disable CSS linting',
                            uniqCls: 'magicss-disable-css-linting',
                            onclick: function (evt, editor) {
                                if (getLanguageMode() === 'css') {
                                    setCodeMirrorCSSLinting(editor.cm, 'disable');
                                } else {
                                    utils.alertNote('Please switch to editing code in CSS mode to enable this feature', 5000);
                                }
                                editor.focus();
                            }
                        },
                        {
                            name: 'disable-autocomplete-selectors',
                            title: 'Disable autocomplete for CSS selectors',
                            uniqCls: 'magicss-disable-autocomplete-selectors',
                            onclick: function (evt, editor) {
                                disableAutocompleteSelectors(editor);
                                utils.alertNote('Disabled autocomplete for CSS selectors', 5000);
                                editor.focus();
                            }
                        },
                        {
                            name: 'enable-autocomplete-selectors',
                            title: 'Enable autocomplete for CSS selectors',
                            uniqCls: 'magicss-enable-autocomplete-selectors',
                            onclick: function (evt, editor) {
                                enableAutocompleteSelectors(editor);
                                utils.alertNote('Enabled autocomplete for CSS selectors', 5000);
                                editor.focus();
                            }
                        },
                        {
                            name: 'minify',
                            title: 'Minify',
                            uniqCls: 'magicss-minify',
                            onclick: function (evt, editor) {
                                var textValue = editor.getTextValue();
                                if (!textValue.trim()) {
                                    editor.setTextValue('').reInitTextComponent({pleaseIgnoreCursorActivity: true});
                                    utils.alertNote('Please write some code to be minified', 5000);
                                } else {
                                    var minifiedCSS = utils.minifyCSS(textValue);
                                    if (textValue !== minifiedCSS) {
                                        editor.setTextValue(minifiedCSS).reInitTextComponent({pleaseIgnoreCursorActivity: true});
                                        utils.alertNote('Your code has been minified' + noteForUndo, 5000);
                                    } else {
                                        utils.alertNote('Your code is already minified', 5000);
                                    }
                                }
                                editor.focus();
                            }
                        },
                        {
                            name: 'gist',
                            title: 'Mail code (via Gist)',
                            uniqCls: 'magicss-email',
                            onclick: function (evt, editor) {
                                createGistAndEmail(editor.getTextValue());
                                editor.focus();
                            }
                        },
                        {
                            name: 'tweet',
                            title: 'Tweet',
                            uniqCls: 'magicss-tweet',
                            href: 'http://twitter.com/intent/tweet?url=https://chrome.google.com/webstore/detail/ifhikkcafabcgolfjegfcgloomalapol&text=' + extLib.TR('Extension_Name', 'Live editor for CSS and LESS - Magic CSS') + ' (for Chrome %26 Firefox) ... web devs check it out!&via=webextensions'
                        },
                        {
                            name: 'github-repo',
                            title: 'Contribute / Report issue',
                            uniqCls: 'magicss-github-repo',
                            href: 'https://github.com/webextensions/live-css-editor'
                        },
                        (function () {
                            if (!isChrome) {
                                return null;
                            }
                            if (executionCounter < 50) {
                                return null;
                            } else {
                                return {
                                    name: 'rate-on-webstore',
                                    title: 'Rate us on Chrome Web Store',
                                    cls: 'magicss-rate-on-webstore',
                                    href: 'https://chrome.google.com/webstore/detail/ifhikkcafabcgolfjegfcgloomalapol/reviews'
                                };
                            }
                        }())
                    ],
                    footer: function ($) {
                        var $footerItems = $('<div></div>'),
                            $status = $('<div class="magicss-status"></div>');
                        $footerItems.append($status);
                        return $footerItems;
                    },
                    events: {
                        launched: function (editor) {
                            utils.addStyleTag({
                                cssText: (
                                    // Setting display style for UI components generated using this extension
                                    '#' + id + ','
                                    + 'html>body #' + id
                                    + '{'
                                        + 'display: block;'
                                    + '}'
                                ),
                                parentTag: 'body'
                            });

                            window.setTimeout(function () {
                                fnApplyTextAsCSS(editor);
                            }, 750);

                            utils.addStyleTag({
                                cssText: (
                                    // Setting display style for UI components generated using this extension
                                    '#' + id + ' .cancelDragHandle'
                                    + '{'
                                        + 'cursor: default;'
                                    + '}'
                                ),
                                parentTag: 'body'
                            });

                            var languageMode = editor.userPreference('language-mode');
                            if (languageMode === 'less') {
                                $(editor.container).addClass('magicss-selected-mode-less');
                            } else {
                                $(editor.container).addClass('magicss-selected-mode-css');
                            }

                            var autocompleteSelectors = editor.userPreference('autocomplete-selectors');
                            if (autocompleteSelectors === 'disabled') {
                                $(editor.container).addClass('magicss-autocomplete-selectors-disabled');
                            } else {
                                $(editor.container).addClass('magicss-autocomplete-selectors-enabled');
                            }
                        },
                        reInitialized: function (editor, cfg) {
                            cfg = cfg || {};
                            var duration = cfg.animDuration,
                                targetWidth = cfg.targetWidth,
                                targetHeight = cfg.targetHeight;
                            $('#' + id + ' .CodeMirror').animate(
                                {
                                    'width': targetWidth,
                                    'height': targetHeight
                                },
                                duration,
                                function () {
                                    editor.saveDimensions({width: targetWidth, height: targetHeight});
                                    editor.bringCursorToView({pleaseIgnoreCursorActivity: true});
                                    editor.disableEnableCSS('disable');
                                }
                            );
                        },
                        beforehide: function (editor) {
                            if (editor.styleHighlightingSelector) {
                                editor.styleHighlightingSelector.cssText = '';
                                editor.styleHighlightingSelector.applyTag();
                            }
                        },
                        afterhide: function () {
                            // currently doing nothing
                        },
                        delayedcursormove: function (editor) {
                            var cssClass = processSplitText(editor.splitTextByCursor());
                            if (!cssClass) {
                                utils.alertNote.hide();
                            }

                            if (!editor.styleHighlightingSelector) {
                                editor.styleHighlightingSelector = new utils.StyleTag({
                                    id: 'magicss-higlight-by-selector',
                                    parentTag: 'body',
                                    overwriteExistingStyleTagWithSameId: true
                                });
                            }

                            if (cssClass) {
                                editor.styleHighlightingSelector.cssText = cssClass + '{outline: 1px dashed red !important;}';
                            } else {
                                editor.styleHighlightingSelector.cssText = '';
                            }
                            editor.styleHighlightingSelector.applyTag();
                        },
                        keyup: function () {
                            // Currently doing nothing
                        },
                        delayedtextchange: function (editor) {
                            fnApplyTextAsCSS(editor);
                        },
                        clear: function (editor) {
                            fnApplyTextAsCSS(editor);
                        }
                    }
                };

                var fnReturnClass = function (splitText) {
                    var strBeforeCursor = splitText.strBeforeCursor,
                        strAfterCursor = splitText.strAfterCursor;

                    if (
                        (strBeforeCursor.substr(-1) === '/' && strAfterCursor.substr(0,1) === '*') ||
                        (strBeforeCursor.substr(-1) === '*' && strAfterCursor.substr(0,1) === '/')
                    ) {
                        return '';
                    }

                    var atSelector = true;
                    for (var i = strBeforeCursor.length; i >= 0; i--) {
                        if (
                            strBeforeCursor.charAt(i-1) === '{' ||
                            (strBeforeCursor.charAt(i-1) === '*' && strBeforeCursor.charAt(i-2) === '/')
                        ) {
                            atSelector = false;
                            break;
                        } else if (
                            strBeforeCursor.charAt(i-1) === ',' ||
                            strBeforeCursor.charAt(i-1) === '}' ||
                            strBeforeCursor.charAt(i-1) === '/'
                        ) {
                            atSelector = true;
                            break;
                        }
                    }

                    if (atSelector) {   // Positioned at a selector
                        // do nothing
                    } else {            // Not positioned at a selector
                        return '';
                    }

                    for (var j = 0; j <= strAfterCursor.length; j++) {
                        var charJ = strAfterCursor.charAt(j-1),
                            charJNext = strAfterCursor.charAt(j);
                        if (
                            charJ === ',' ||
                            charJ === '{' ||
                            charJ === '}' ||
                            (charJ === '*' && charJNext === '\/') ||
                            (charJ === '\/' && charJNext === '*')
                        ) {
                            break;
                        }
                    }

                    var cssClass = strBeforeCursor.substring(i) + strAfterCursor.substring(0, j - 1);
                    cssClass = jQuery.trim(cssClass);

                    if (cssClass) {
                        var count;

                        try {
                            count = $(cssClass).length;
                        } catch (e) {
                            return '';
                        }

                        var trunc = function (str, limit) {
                            if (str.length > limit) {
                                var separator = ' ... ';
                                str = str.substr(0, limit / 2) + separator + str.substr(separator.length + str.length - limit / 2);
                            }
                            return str;
                        };

                        if (count) {
                            utils.alertNote(trunc(cssClass, 100) + '&nbsp; &nbsp;<span style="font-weight:normal;">(' + count + ' match' + ((count === 1) ? '':'es') + ')</span>', 2500);
                        } else {
                            utils.alertNote(trunc(cssClass, 100) + '&nbsp; &nbsp;<span style="font-weight:normal;">(No matches)</span>', 2500);
                        }
                    }

                    return cssClass;
                };

                var processSplitText = function (splitText) {
                    if (getLanguageMode() === 'less') {
                        if (!smc) {
                            return '';
                        }

                        var beforeCursor = splitText.strBeforeCursor,
                            rowNumber = (beforeCursor.match(/\n/g) || []).length,
                            columnNumber = beforeCursor.substr(beforeCursor.lastIndexOf('\n') + 1).length,
                            generatedPosition = smc.generatedPositionFor({
                                source: 'input',
                                line: rowNumber + 1,  // Minimum value is 1 for line
                                column: columnNumber  // Minimum value is 0 for column
                            });

                        var cssCode = newStyleTag.cssText,
                            cssTextInLines = cssCode.split('\n'),
                            strFirstPart,
                            strLastPart;
                        if (generatedPosition.line) {
                            cssTextInLines = cssTextInLines.splice(0, generatedPosition.line);
                            var lastItem = cssTextInLines[cssTextInLines.length - 1];
                            cssTextInLines[cssTextInLines.length - 1] = lastItem.substr(0, generatedPosition.column);
                            strFirstPart = cssTextInLines.join('\n');
                            strLastPart = newStyleTag.cssText.substr(strFirstPart.length);
                            return fnReturnClass({
                                strBeforeCursor: strFirstPart,
                                strAfterCursor: strLastPart
                            });
                        } else {
                            return '';
                        }
                    } else {
                        return fnReturnClass(splitText);
                    }
                };

                class StylesEditor extends window.Editor {
                    indicateEnabledDisabled(enabledDisabled) {
                        if (enabledDisabled === 'enabled') {
                            $(this.container).removeClass('indicate-disabled').addClass('indicate-enabled');
                        } else {
                            $(this.container).removeClass('indicate-enabled').addClass('indicate-disabled');
                        }
                    }

                    disableEnableCSS(doWhat) {
                        newStyleTag.disabled = doWhat === 'disable';
                        newStyleTag.applyTag();

                        if (doWhat === 'disable') {
                            this.indicateEnabledDisabled('disabled');
                            utils.alertNote('Deactivated the code', 5000);
                        } else {
                            this.indicateEnabledDisabled('enabled');
                            utils.alertNote('Activated the code', 5000);
                        }
                    }
                }

                window.MagiCSSEditor = new StylesEditor(options);

                if (executionCounter && !isNaN(executionCounter)) {
                    try {
                        chromeStorage.set({'magicss-execution-counter': executionCounter}, function() {
                            // do nothing
                        });
                    } catch (e) {
                        // do nothing
                    }
                }
            }
        });
    };

    var executionCounter = 0;
    try {
        var chromeStorage = chrome.storage.sync;
        chromeStorage.get('magicss-execution-counter', function (values) {
            try {
                executionCounter = parseInt(values['magicss-execution-counter'], 10);
                executionCounter = isNaN(executionCounter) ? 0 : executionCounter;
                executionCounter = executionCounter < 0 ? 0 : executionCounter;
                executionCounter++;
            } catch (e) {
                // do nothing
            }
            main();
        });
    } catch (e) {
        main();
    }
}(jQuery));