define(function (require, exports, module) {
        "use strict";

        var CommandManager = brackets.getModule("command/CommandManager"),
            Commands = brackets.getModule("command/Commands"),
            EditorManager = brackets.getModule("editor/EditorManager"),
            Menus = brackets.getModule("command/Menus"),
            ProjectManager = brackets.getModule("project/ProjectManager"),
            ModalBar = brackets.getModule("widgets/ModalBar").ModalBar,
            FileUtils = brackets.getModule("file/FileUtils"),
            KeyEvent = brackets.getModule("utils/KeyEvent"),
            FileSystem = brackets.getModule("filesystem/FileSystem"),
            Directory = brackets.getModule("filesystem/Directory"),
            DocumentManager = brackets.getModule('document/DocumentManager');

        var modalBar = null,
            TRANSLATE_FILE_KEY = 'korri.citranslate.config.';

        function createModalBar(template, submitCallback) {
            if (modalBar) {
                modalBar.close(true);
            }
            modalBar = new ModalBar(template, false, true);


            //Handle ENTER and ESCAPE keys manually
            getDialogTextFields().keydown(function (e) {
                if (e.keyCode === KeyEvent.DOM_VK_RETURN || e.keyCode === KeyEvent.DOM_VK_ESCAPE) {
                    e.stopPropagation();
                    e.preventDefault();
                    if (modalBar) {
                        modalBar.close(true);
                    }
                    var oldModal = modalBar;
                    if (e.keyCode === KeyEvent.DOM_VK_RETURN) {
                        if (submitCallback) {
                            submitCallback.call(modalBar);
                        }
                    }
                    if (modalBar === oldModal) {
                        modalBar = null;
                    }
                }
            });
        }

        function getDialogTextFields() {
            return $("input[type='text']", modalBar.getRoot());
        }

        function escapeString(string) {
            return String(string).replace(/'/g, '\\\'').replace(/\n/g, '\\n').replace(/\r/g, '');
        }

        function unescapeString(string) {
            return String(string).replace(/\\('|")/g, '$1');
        }

        function escapeRegExp(str) {
            return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
        }

        function loadConfigOptions(callback) {
            var projectRoot = ProjectManager.getProjectRoot(),
                storage_key = TRANSLATE_FILE_KEY + projectRoot.name,
                config;

            try {
                config = JSON.parse(localStorage.getItem(storage_key));
                checkConfig(config, callback);
            } catch (e) {
                //Try to open project config
                FileSystem.resolve(projectRoot.fullPath + '.citranslate', function (err, languageFile) {
                    if (err) {
                        config = {
                            language_file: null,
                            language_folder: 'application/language'
                        };
                        checkConfig(config, callback);
                    } else {
                        DocumentManager.getDocumentText(languageFile)
                            .done(function (text) {
                                checkConfig(JSON.parse(text), callback);
                            });
                    }
                });
            }
        }

        function checkConfig(config, callback) {
            var projectRoot = ProjectManager.getProjectRoot(),
                storage_key = TRANSLATE_FILE_KEY + projectRoot.name;
            if (!config.language_file) {
                config.language_folder = prompt('Path to the language folder', config.language_folder);
                config.language_file = prompt('Name of the language file (Enter example_lang to translate application/language/english/example_lang.php)', config.language_file);
            }
            localStorage.setItem(storage_key, JSON.stringify(config));
            callback(config);
        }

        /**
         * Loop and open all language files
         * @param callback Callback called for each file
         * @param end_callback Callback called after the last language file callback has been called
         */
        function openLanguageFiles(callback, end_callback) {
            loadConfigOptions(function (config) {

                var projectRoot = ProjectManager.getProjectRoot(),
                    storage_key = TRANSLATE_FILE_KEY + projectRoot.name;

                var dirEntry = FileSystem.getDirectoryForPath(projectRoot.fullPath + config.language_folder);
                dirEntry.exists(function (error, exists) {
                    if (!exists) {
                        alert('Folder "' + projectRoot.fullPath + config.language_folder + '" does not exist');
                        localStorage.setItem(storage_key, null);
                    } else {
                        dirEntry.getContents(function (error, entries) {
                            if (error) {
                                alert('Error: ' + error);
                            } else {
                                var count = entries.length;
                                entries.forEach(function (entry) {
                                    if (!(entry instanceof Directory)) {
                                        if (--count == 0 && end_callback) {
                                            end_callback();
                                        }
                                        return;
                                    }
                                    FileSystem.resolve(entry.fullPath + config.language_file + '.php', function (err, languageFile) {
                                        if (err) {
                                            localStorage.setItem(storage_key, null);
                                            alert('Language file (' + entry.name + '/' + config.language_file + '.php) not found (' + err + '), will ask for language file name again next time.');
                                        } else {
                                            if (languageFile.isDirectory) {
                                                alert('Language file (' + config.language_file + '.php) is a directory !');
                                            } else {
                                                DocumentManager.getDocumentForPath(languageFile.fullPath)
                                                    .done(function (doc) {
                                                        callback(doc, entry.name);
                                                        if (--count == 0 && end_callback) {
                                                            end_callback();
                                                        }
                                                    });
                                            }
                                        }
                                    });
                                });
                            }
                        }, function (error) {
                            alert('Error opening language files');
                        });
                    }
                });
            });
        }

        /**
         * Edit translation of translated string at cursor position
         */
        function handleTranslate() {
            var editor = EditorManager.getFocusedEditor();

            if (!editor) {
                return;
            }

            var pos = editor.getCursorPos(),
                doc = editor.document,
                originalFileEntry = doc.file,
                filename = originalFileEntry.name,
                is_smarty = filename.match(/\.tpl$/),
                text = '';


            var range = {
                'start': {
                    line: pos.line,
                    ch: pos.ch
                },
                'end': {
                    line: pos.line,
                    ch: pos.ch
                }
            }
            var key;
            if (is_smarty) {
                //Left
                do {
                    range.start.ch--;
                    text = doc.getRange(range.start, range.end);
                } while (range.start.ch > 0 && text.charAt(0) != '{');
                if (text.charAt(0) != '{') {
                    return;
                }
                //Right
                do {
                    range.end.ch++;
                    text = doc.getRange(range.start, range.end);
                } while (/*Have we reached the end*/text.length == range.end.ch - range.start.ch && text.charAt(text.length - 1) != '}');

                if (text.charAt(text.length - 1) != '}') {
                    return;
                }
                var res;
                if (!(res = text.match(/^\{l\s+(?:"|')(.*)(?:"|')\s*\}$/))) {
                    return;
                }
                key = res[1];
            } else {
                range.start.ch -= 4;
                //Left
                do {
                    range.start.ch--;
                    text = doc.getRange(range.start, range.end);
                } while (range.start.ch > 0 && text.substr(0, 5) != 'lang(');
                if (text.substr(0, 5) != 'lang(') {
                    return;
                }
                //Right
                do {
                    range.end.ch++;
                    text = doc.getRange(range.start, range.end);
                } while (range.end.ch < 100 && text.charAt(text.length - 1) != ')');

                if (text.charAt(text.length - 1) != ')') {
                    return;
                }
                var res;
                if (!(res = text.match(/^lang\(\s*(?:"|')(.*)(?:"|')\s*\)$/))) {
                    return;
                }
                key = res[1];
            }
            translateKey(key);
        }

        /**
         * Show translation editor for one language key
         */
        function translateKey(key) {
            var editor = EditorManager.getFocusedEditor();
            if (!editor) {
                return;
            }
            var originalFileEntry = editor.document.file;

            var lines = {},
                reg = new RegExp('\\$lang\\[(?:\'|")' + escapeRegExp(key) + '(?:\'|")\\]\\s*=\\s*(?:\'|")(.*)(?:\'|")\\s*;?');
            openLanguageFiles(function (doc, language) {
                var text = doc.getText(true),
                    matches = text.match(reg);

                if (matches) {
                    lines[language] = matches[1].replace(/\\'/g, "'");
                } else {
                    alert('Line "' + key + '" not found in "' + language + '" language file.');
                }
            }, function () {
                CommandManager.execute(Commands.CMD_OPEN, {fullPath: originalFileEntry.fullPath});
                var table = $('<table/>').css('margin-right', '1em');
                for (var lang in lines) {
                    var line = lines[lang];
                    var tr = $('<tr/>')
                        .append(
                            $('<td/>')
                                .css({
                                    whiteSpace: 'nowrap',
                                    width: '5%'
                                })
                                .append(
                                    $('<span/>')
                                        .text('"' + key + '" in "')
                                )
                                .append(
                                    $('<strong/>')
                                        .text(lang)
                                )
                                .append('"')
                        )
                        .append(
                            $('<td/>')
                                .append(
                                    $('<input/>')
                                        .attr('type', 'text')
                                        .attr('name', lang)
                                        .val(line)
                                        .css({
                                            width: '100%',
                                            boxSizing: 'border-box',
                                            height: 30
                                        })
                                )
                        );
                    table.append(tr);
                }

                createModalBar(table, function () {

                    var lines = {};

                    inputs.each(function () {
                        var _this = $(this),
                            name = _this.attr('name'),
                            value = _this.val();

                        lines[name] = value;
                    });
                    openLanguageFiles(function (doc, lang) {
                        var text = doc.getText(),
                            line = "$lang['" + key + "'] = '" + escapeString(lines[lang]) + "';";
                        text = text.replace(reg, line);
                        doc.setText(text);
                    }, function () {
                        CommandManager.execute(Commands.FILE_OPEN, {fullPath: originalFileEntry.fullPath});
                    });

                });
                var inputs = getDialogTextFields();
                inputs.eq(0).focus();
            });
        }

        /**
         * Convert selected string to translated string
         */
        function handleConvert() {
            var editor = EditorManager.getFocusedEditor();

            if (!editor) {
                return;
            }

            var sel = editor.getSelection(),
                hasSelection = (sel.start.line !== sel.end.line) || (sel.start.ch !== sel.end.ch);

            if (!hasSelection) {
                return;
            }

            var doc = editor.document,
                originalFileEntry = doc.file,
                filename = originalFileEntry.name,
                is_smarty = filename.match(/\.tpl$/),
                selectedText = doc.getRange(sel.start, sel.end);
            if (!is_smarty) {
                selectedText = unescapeString(selectedText.replace(/^('|")/, '').replace(/('|")$/, ''));
            }
            //Let's see if this has allready been translated
            var found_keys = new Array(),
                reg = new RegExp('\\$lang\\[(?:\'|")(.+)(?:\'|")\\]\\s*=\\s*(?:\'|")' + escapeRegExp(escapeString(selectedText)) + '(?:\'|")\\s*;?', 'g');
            openLanguageFiles(function (doc, lang) {
                var text = doc.getText(true),
                    matches;
                //Only add unique keys
                while (matches = reg.exec(text)) {
                    var yet = false;
                    for (var k in found_keys) {
                        if (found_keys[k] == matches[1]) {
                            yet = true;
                        }
                    }
                    if (!yet) {
                        found_keys.push(matches[1]);
                    }
                }
            }, function () {
                //Back to main edited document
                CommandManager.execute(Commands.FILE_OPEN, {fullPath: originalFileEntry.fullPath}).done(function () {
                    var choose_tag = function () {
                        var key = $(this).text(),
                            lang_tag = is_smarty ? '{l "' + key + '"}' : "lang('" + key + "')";
                        doc.replaceRange(lang_tag, sel.start, sel.end);

                        if (modalBar) {
                            modalBar.close(true);
                        }
                    }
                    var input =
                        $('<input/>')
                            .attr('type', 'text')
                            .css('width', '10em')
                            .val(filename.replace(/\.([a-z]{3})$/, '') + '.');

                    var queryDialog = $('<span/>')
                        .append($('<span/>').text('Language key:'))
                        .append(input);

                    if (found_keys.length > 0) {
                        queryDialog.append(
                            $('<span/>').text('Use existing key with same value: ')
                        );
                        for (var key in found_keys) {
                            queryDialog.append(
                                $('<button>')
                                    .addClass('btn')
                                    .text(found_keys[key])
                                    .click(choose_tag)
                            )
                        }
                    }

                    createModalBar(queryDialog, function () {
                        var key = input.val(),
                            lang_tag = is_smarty ? '{l "' + key + '"}' : "lang('" + key + "')";

                        if (!key) {
                            return;
                        }

                        doc.replaceRange(lang_tag, sel.start, sel.end);

                        openLanguageFiles(function (doc, lang) {
                            var text = doc.getText().trim();
                            text += "\n$lang['" + key + "'] = '" + escapeString(selectedText) + "';\n";
                            doc.setText(text);
                        }, function () {
                            //CommandManager.execute(Commands.CMD_OPEN, {fullPath: originalFileEntry.fullPath});
                            translateKey(key);
                        });
                    });
                    input.focus();
                });
            });
        }

        var menu = Menus.getMenu(Menus.AppMenuBar.EDIT_MENU);

// Commands
        var COMMAND_ID_CONVERT = "korri.citranslate.convert";   // package-style naming to avoid collisions
        CommandManager.register("CITranslate: Translate Text", COMMAND_ID_CONVERT, handleConvert);

        var COMMAND_ID_EDIT = "korri.citranslate.edit";   // package-style naming to avoid collisions
        CommandManager.register("CITranslate: Edit Translation", COMMAND_ID_EDIT, handleTranslate);


        menu.addMenuDivider();
        menu.addMenuItem(COMMAND_ID_CONVERT, 'Ctrl-Shift-Alt-T');
        menu.addMenuItem(COMMAND_ID_EDIT, 'Ctrl-Shift-Alt-R');

        exports.handleConvert = handleConvert;
        exports.handleTranslate = handleTranslate;
    }
);
