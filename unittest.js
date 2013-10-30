define(function (require, exports, module) {
    "use strict";

    var main = require("main");

    describe("Exports", function () {
        it("should expose a handleConvert method", function () {
            expect(main.handleConvert).not.toBeNull();
        });
        it("should expose a handleTranslate method", function () {
            expect(main.handleTranslate).not.toBeNull();
        });
    });
});