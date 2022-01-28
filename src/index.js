"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getScrubFileTransformerForCore = exports.getScrubFileTransformer = exports.getWrapEnumsTransformer = exports.getPrefixFunctionsTransformer = exports.getPrefixClassesTransformer = exports.transformJavascript = exports.buildOptimizer = exports.BuildOptimizerWebpackPlugin = exports.buildOptimizerLoaderPath = exports.buildOptimizerLoader = void 0;
const scrub_file_1 = require("./transforms/scrub-file");
var webpack_loader_1 = require("./build-optimizer/webpack-loader");
Object.defineProperty(exports, "buildOptimizerLoader", { enumerable: true, get: function () { return __importDefault(webpack_loader_1).default; } });
Object.defineProperty(exports, "buildOptimizerLoaderPath", { enumerable: true, get: function () { return webpack_loader_1.buildOptimizerLoaderPath; } });
var webpack_plugin_1 = require("./build-optimizer/webpack-plugin");
Object.defineProperty(exports, "BuildOptimizerWebpackPlugin", { enumerable: true, get: function () { return webpack_plugin_1.BuildOptimizerWebpackPlugin; } });
var build_optimizer_1 = require("./build-optimizer/build-optimizer");
Object.defineProperty(exports, "buildOptimizer", { enumerable: true, get: function () { return build_optimizer_1.buildOptimizer; } });
var transform_javascript_1 = require("./helpers/transform-javascript");
Object.defineProperty(exports, "transformJavascript", { enumerable: true, get: function () { return transform_javascript_1.transformJavascript; } });
var prefix_classes_1 = require("./transforms/prefix-classes");
Object.defineProperty(exports, "getPrefixClassesTransformer", { enumerable: true, get: function () { return prefix_classes_1.getPrefixClassesTransformer; } });
var prefix_functions_1 = require("./transforms/prefix-functions");
Object.defineProperty(exports, "getPrefixFunctionsTransformer", { enumerable: true, get: function () { return prefix_functions_1.getPrefixFunctionsTransformer; } });
var wrap_enums_1 = require("./transforms/wrap-enums");
Object.defineProperty(exports, "getWrapEnumsTransformer", { enumerable: true, get: function () { return wrap_enums_1.getWrapEnumsTransformer; } });
function getScrubFileTransformer(program) {
    return (0, scrub_file_1.createScrubFileTransformerFactory)(false)(program);
}
exports.getScrubFileTransformer = getScrubFileTransformer;
function getScrubFileTransformerForCore(program) {
    return (0, scrub_file_1.createScrubFileTransformerFactory)(true)(program);
}
exports.getScrubFileTransformerForCore = getScrubFileTransformerForCore;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyX2RldmtpdC9idWlsZF9vcHRpbWl6ZXIvc3JjL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7OztBQUdILHdEQUE0RTtBQUU1RSxtRUFHMEM7QUFGeEMsdUlBQUEsT0FBTyxPQUF3QjtBQUMvQiwwSEFBQSx3QkFBd0IsT0FBQTtBQUUxQixtRUFBK0U7QUFBdEUsNkhBQUEsMkJBQTJCLE9BQUE7QUFDcEMscUVBQW1FO0FBQTFELGlIQUFBLGNBQWMsT0FBQTtBQUV2Qix1RUFBcUU7QUFBNUQsMkhBQUEsbUJBQW1CLE9BQUE7QUFFNUIsOERBQTBFO0FBQWpFLDZIQUFBLDJCQUEyQixPQUFBO0FBQ3BDLGtFQUE4RTtBQUFyRSxpSUFBQSw2QkFBNkIsT0FBQTtBQUN0QyxzREFBa0U7QUFBekQscUhBQUEsdUJBQXVCLE9BQUE7QUFFaEMsU0FBZ0IsdUJBQXVCLENBQ3JDLE9BQW9CO0lBRXBCLE9BQU8sSUFBQSw4Q0FBaUMsRUFBQyxLQUFLLENBQUMsQ0FBQyxPQUFPLENBQUMsQ0FBQztBQUMzRCxDQUFDO0FBSkQsMERBSUM7QUFFRCxTQUFnQiw4QkFBOEIsQ0FDNUMsT0FBb0I7SUFFcEIsT0FBTyxJQUFBLDhDQUFpQyxFQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDO0FBQzFELENBQUM7QUFKRCx3RUFJQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgKiBhcyB0cyBmcm9tICd0eXBlc2NyaXB0JztcbmltcG9ydCB7IGNyZWF0ZVNjcnViRmlsZVRyYW5zZm9ybWVyRmFjdG9yeSB9IGZyb20gJy4vdHJhbnNmb3Jtcy9zY3J1Yi1maWxlJztcblxuZXhwb3J0IHtcbiAgZGVmYXVsdCBhcyBidWlsZE9wdGltaXplckxvYWRlcixcbiAgYnVpbGRPcHRpbWl6ZXJMb2FkZXJQYXRoLFxufSBmcm9tICcuL2J1aWxkLW9wdGltaXplci93ZWJwYWNrLWxvYWRlcic7XG5leHBvcnQgeyBCdWlsZE9wdGltaXplcldlYnBhY2tQbHVnaW4gfSBmcm9tICcuL2J1aWxkLW9wdGltaXplci93ZWJwYWNrLXBsdWdpbic7XG5leHBvcnQgeyBidWlsZE9wdGltaXplciB9IGZyb20gJy4vYnVpbGQtb3B0aW1pemVyL2J1aWxkLW9wdGltaXplcic7XG5cbmV4cG9ydCB7IHRyYW5zZm9ybUphdmFzY3JpcHQgfSBmcm9tICcuL2hlbHBlcnMvdHJhbnNmb3JtLWphdmFzY3JpcHQnO1xuXG5leHBvcnQgeyBnZXRQcmVmaXhDbGFzc2VzVHJhbnNmb3JtZXIgfSBmcm9tICcuL3RyYW5zZm9ybXMvcHJlZml4LWNsYXNzZXMnO1xuZXhwb3J0IHsgZ2V0UHJlZml4RnVuY3Rpb25zVHJhbnNmb3JtZXIgfSBmcm9tICcuL3RyYW5zZm9ybXMvcHJlZml4LWZ1bmN0aW9ucyc7XG5leHBvcnQgeyBnZXRXcmFwRW51bXNUcmFuc2Zvcm1lciB9IGZyb20gJy4vdHJhbnNmb3Jtcy93cmFwLWVudW1zJztcblxuZXhwb3J0IGZ1bmN0aW9uIGdldFNjcnViRmlsZVRyYW5zZm9ybWVyKFxuICBwcm9ncmFtPzogdHMuUHJvZ3JhbSxcbik6IHRzLlRyYW5zZm9ybWVyRmFjdG9yeTx0cy5Tb3VyY2VGaWxlPiB7XG4gIHJldHVybiBjcmVhdGVTY3J1YkZpbGVUcmFuc2Zvcm1lckZhY3RvcnkoZmFsc2UpKHByb2dyYW0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0U2NydWJGaWxlVHJhbnNmb3JtZXJGb3JDb3JlKFxuICBwcm9ncmFtPzogdHMuUHJvZ3JhbSxcbik6IHRzLlRyYW5zZm9ybWVyRmFjdG9yeTx0cy5Tb3VyY2VGaWxlPiB7XG4gIHJldHVybiBjcmVhdGVTY3J1YkZpbGVUcmFuc2Zvcm1lckZhY3RvcnkodHJ1ZSkocHJvZ3JhbSk7XG59XG4iXX0=