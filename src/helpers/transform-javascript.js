"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transformJavascript = void 0;
const ts = __importStar(require("typescript"));
function validateDiagnostics(diagnostics, strict) {
    // Print error diagnostics.
    const hasError = diagnostics.some((diag) => diag.category === ts.DiagnosticCategory.Error);
    if (hasError) {
        // Throw only if we're in strict mode, otherwise return original content.
        if (strict) {
            const errorMessages = ts.formatDiagnostics(diagnostics, {
                getCurrentDirectory: () => ts.sys.getCurrentDirectory(),
                getNewLine: () => ts.sys.newLine,
                getCanonicalFileName: (f) => f,
            });
            throw new Error(`
        TS failed with the following error messages:

        ${errorMessages}
      `);
        }
        else {
            return false;
        }
    }
    return true;
}
function transformJavascript(options) {
    const { content, getTransforms, emitSourceMap, inputFilePath, outputFilePath, strict } = options;
    // Bail if there's no transform to do.
    if (getTransforms.length === 0) {
        return {
            content: null,
            sourceMap: null,
            emitSkipped: true,
        };
    }
    const allowFastPath = options.typeCheck === false && !emitSourceMap;
    const outputs = new Map();
    const tempFilename = 'bo-default-file.js';
    const tempSourceFile = ts.createSourceFile(tempFilename, content, ts.ScriptTarget.Latest, allowFastPath);
    const parseDiagnostics = tempSourceFile.parseDiagnostics;
    const tsOptions = {
        // We target latest so that there is no downleveling.
        target: ts.ScriptTarget.Latest,
        isolatedModules: true,
        suppressOutputPathCheck: true,
        allowNonTsExtensions: true,
        noLib: true,
        noResolve: true,
        sourceMap: emitSourceMap,
        inlineSources: emitSourceMap,
        inlineSourceMap: false,
    };
    if (allowFastPath && parseDiagnostics) {
        if (!validateDiagnostics(parseDiagnostics, strict)) {
            return {
                content: null,
                sourceMap: null,
                emitSkipped: true,
            };
        }
        // All fast path transformers do not use a program
        const transforms = getTransforms.map((getTf) => getTf(/* program */ undefined));
        const result = ts.transform(tempSourceFile, transforms, tsOptions);
        if (result.transformed.length === 0 || result.transformed[0] === tempSourceFile) {
            return {
                content: null,
                sourceMap: null,
                emitSkipped: true,
            };
        }
        const printer = ts.createPrinter(undefined, {
            onEmitNode: result.emitNodeWithNotification,
            substituteNode: result.substituteNode,
        });
        const output = printer.printFile(result.transformed[0]);
        result.dispose();
        return {
            content: output,
            sourceMap: null,
            emitSkipped: false,
        };
    }
    const host = {
        getSourceFile: (fileName) => {
            if (fileName !== tempFilename) {
                throw new Error(`File ${fileName} does not have a sourceFile.`);
            }
            return tempSourceFile;
        },
        getDefaultLibFileName: () => 'lib.d.ts',
        getCurrentDirectory: () => '',
        getDirectories: () => [],
        getCanonicalFileName: (fileName) => fileName,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
        fileExists: (fileName) => fileName === tempFilename,
        readFile: (_fileName) => '',
        writeFile: (fileName, text) => outputs.set(fileName, text),
    };
    const program = ts.createProgram([tempFilename], tsOptions, host);
    const diagnostics = program.getSyntacticDiagnostics(tempSourceFile);
    if (!validateDiagnostics(diagnostics, strict)) {
        return {
            content: null,
            sourceMap: null,
            emitSkipped: true,
        };
    }
    // We need the checker inside transforms.
    const transforms = getTransforms.map((getTf) => getTf(program));
    program.emit(undefined, undefined, undefined, undefined, { before: transforms, after: [] });
    let transformedContent = outputs.get(tempFilename);
    if (!transformedContent) {
        return {
            content: null,
            sourceMap: null,
            emitSkipped: true,
        };
    }
    let sourceMap = null;
    const tsSourceMap = outputs.get(`${tempFilename}.map`);
    if (emitSourceMap && tsSourceMap) {
        const urlRegExp = /^\/\/# sourceMappingURL=[^\r\n]*/gm;
        sourceMap = JSON.parse(tsSourceMap);
        // Fix sourcemaps file references.
        if (outputFilePath) {
            sourceMap.file = outputFilePath;
            transformedContent = transformedContent.replace(urlRegExp, `//# sourceMappingURL=${sourceMap.file}.map\n`);
            if (inputFilePath) {
                sourceMap.sources = [inputFilePath];
            }
            else {
                sourceMap.sources = [''];
            }
        }
        else {
            // TODO: figure out if we should inline sources here.
            transformedContent = transformedContent.replace(urlRegExp, '');
            sourceMap.file = '';
            sourceMap.sources = [''];
        }
    }
    return {
        content: transformedContent,
        sourceMap,
        emitSkipped: false,
    };
}
exports.transformJavascript = transformJavascript;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhbnNmb3JtLWphdmFzY3JpcHQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyX2RldmtpdC9idWlsZF9vcHRpbWl6ZXIvc3JjL2hlbHBlcnMvdHJhbnNmb3JtLWphdmFzY3JpcHQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUdILCtDQUFpQztBQTBCakMsU0FBUyxtQkFBbUIsQ0FBQyxXQUF5QyxFQUFFLE1BQWdCO0lBQ3RGLDJCQUEyQjtJQUUzQixNQUFNLFFBQVEsR0FBRyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxLQUFLLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxLQUFLLENBQUMsQ0FBQztJQUMzRixJQUFJLFFBQVEsRUFBRTtRQUNaLHlFQUF5RTtRQUN6RSxJQUFJLE1BQU0sRUFBRTtZQUNWLE1BQU0sYUFBYSxHQUFHLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLEVBQUU7Z0JBQ3RELG1CQUFtQixFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsbUJBQW1CLEVBQUU7Z0JBQ3ZELFVBQVUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLE9BQU87Z0JBQ2hDLG9CQUFvQixFQUFFLENBQUMsQ0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2FBQ3ZDLENBQUMsQ0FBQztZQUVILE1BQU0sSUFBSSxLQUFLLENBQUM7OztVQUdaLGFBQWE7T0FDaEIsQ0FBQyxDQUFDO1NBQ0o7YUFBTTtZQUNMLE9BQU8sS0FBSyxDQUFDO1NBQ2Q7S0FDRjtJQUVELE9BQU8sSUFBSSxDQUFDO0FBQ2QsQ0FBQztBQUVELFNBQWdCLG1CQUFtQixDQUNqQyxPQUFtQztJQUVuQyxNQUFNLEVBQUUsT0FBTyxFQUFFLGFB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QUFFLENBQUMsQ0FBQztTQUMxQjtLQUNGO0lBRUQsT0FBTztRQUNMLE9BQU8sRUFBRSxrQkFBa0I7UUFDM0IsU0FBUztRQUNULFdBQVcsRUFBRSxLQUFLO0tBQ25CLENBQUM7QUFDSixDQUFDO0FBdkpELGtEQXVKQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgeyBSYXdTb3VyY2VNYXAgfSBmcm9tICdzb3VyY2UtbWFwJztcbmltcG9ydCAqIGFzIHRzIGZyb20gJ3R5cGVzY3JpcHQnO1xuXG5leHBvcnQgdHlwZSBUcmFuc2Zvcm1lckZhY3RvcnlDcmVhdG9yID0gKFxuICBwcm9ncmFtPzogdHMuUHJvZ3JhbSxcbikgPT4gdHMuVHJhbnNmb3JtZXJGYWN0b3J5PHRzLlNvdXJjZUZpbGU+O1xuXG5leHBvcnQgaW50ZXJmYWNlIFRyYW5zZm9ybUphdmFzY3JpcHRPcHRpb25zIHtcbiAgY29udGVudDogc3RyaW5nO1xuICBpbnB1dEZpbGVQYXRoPzogc3RyaW5nO1xuICBvdXRwdXRGaWxlUGF0aD86IHN0cmluZztcbiAgZW1pdFNvdXJjZU1hcD86IGJvb2xlYW47XG4gIHN0cmljdD86IGJvb2xlYW47XG4gIHR5cGVDaGVjaz86IGJvb2xlYW47XG4gIGdldFRyYW5zZm9ybXM6IFRyYW5zZm9ybWVyRmFjdG9yeUNyZWF0b3JbXTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBUcmFuc2Zvcm1KYXZhc2NyaXB0T3V0cHV0IHtcbiAgY29udGVudDogc3RyaW5nIHwgbnVsbDtcbiAgc291cmNlTWFwOiBSYXdTb3VyY2VNYXAgfCBudWxsO1xuICBlbWl0U2tpcHBlZDogYm9vbGVhbjtcbn1cblxuaW50ZXJmYWNlIERpYWdub3N0aWNTb3VyY2VGaWxlIGV4dGVuZHMgdHMuU291cmNlRmlsZSB7XG4gIHJlYWRvbmx5IHBhcnNlRGlhZ25vc3RpY3M/OiBSZWFkb25seUFycmF5PHRzLkRpYWdub3N0aWM+O1xufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZURpYWdub3N0aWNzKGRpYWdub3N0aWNzOiBSZWFkb25seUFycmF5PHRzLkRpYWdub3N0aWM+LCBzdHJpY3Q/OiBib29sZWFuKTogYm9vbGVhbiB7XG4gIC8vIFByaW50IGVycm9yIGRpYWdub3N0aWNzLlxuXG4gIGNvbnN0IGhhc0Vycm9yID0gZGlhZ25vc3RpY3Muc29tZSgoZGlhZykgPT4gZGlhZy5jYXRlZ29yeSA9PT0gdHMuRGlhZ25vc3RpY0NhdGVnb3J5LkVycm9yKTtcbiAgaWYgKGhhc0Vycm9yKSB7XG4gICAgLy8gVGhyb3cgb25seSBpZiB3ZSdyZSBpbiBzdHJpY3QgbW9kZSwgb3RoZXJ3aXNlIHJldHVybiBvcmlnaW5hbCBjb250ZW50LlxuICAgIGlmIChzdHJpY3QpIHtcbiAgICAgIGNvbnN0IGVycm9yTWVzc2FnZXMgPSB0cy5mb3JtYXREaWFnbm9zdGljcyhkaWFnbm9zdGljcywge1xuICAgICAgICBnZXRDdXJyZW50RGlyZWN0b3J5OiAoKSA9PiB0cy5zeXMuZ2V0Q3VycmVudERpcmVjdG9yeSgpLFxuICAgICAgICBnZXROZXdMaW5lOiAoKSA9PiB0cy5zeXMubmV3TGluZSxcbiAgICAgICAgZ2V0Q2Fub25pY2FsRmlsZU5hbWU6IChmOiBzdHJpbmcpID0+IGYsXG4gICAgICB9KTtcblxuICAgICAgdGhyb3cgbmV3IEVycm9yKGBcbiAgICAgICAgVFMgZmFpbGVkIHdpdGggdGhlIGZvbGxvd2luZyBlcnJvciBtZXNzYWdlczpcblxuICAgICAgICAke2Vycm9yTWVzc2FnZXN9XG4gICAgICBgKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB0cnVlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdHJhbnNmb3JtSmF2YXNjcmlwdChcbiAgb3B0aW9uczogVHJhbnNmb3JtSmF2YXNjcmlwdE9wdGlvbnMsXG4pOiBUcmFuc2Zvcm1KYXZhc2NyaXB0T3V0cHV0IHtcbiAgY29uc3QgeyBjb250ZW50LCBnZXRUcmFuc2Zvcm1zLCBlbWl0U291cmNlTWFwLCBpbnB1dEZpbGVQYXRoLCBvdXRwdXRGaWxlUGF0aCwgc3RyaWN0IH0gPSBvcHRpb25zO1xuXG4gIC8vIEJhaWwgaWYgdGhlcmUncyBubyB0cmFuc2Zvcm0gdG8gZG8uXG4gIGlmIChnZXRUcmFuc2Zvcm1zLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiB7XG4gICAgICBjb250ZW50OiBudWxsLFxuICAgICAgc291cmNlTWFwOiBudWxsLFxuICAgICAgZW1pdFNraXBwZWQ6IHRydWUsXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IGFsbG93RmFzdFBhdGggPSBvcHRpb25zLnR5cGVDaGVjayA9PT0gZmFsc2UgJiYgIWVtaXRTb3VyY2VNYXA7XG4gIGNvbnN0IG91dHB1dHMgPSBuZXcgTWFwPHN0cmluZywgc3RyaW5nPigpO1xuICBjb25zdCB0ZW1wRmlsZW5hbWUgPSAnYm8tZGVmYXVsdC1maWxlLmpzJztcbiAgY29uc3QgdGVtcFNvdXJjZUZpbGUgPSB0cy5jcmVhdGVTb3VyY2VGaWxlKFxuICAgIHRlbXBGaWxlbmFtZSxcbiAgICBjb250ZW50LFxuICAgIHRzLlNjcmlwdFRhcmdldC5MYXRlc3QsXG4gICAgYWxsb3dGYXN0UGF0aCxcbiAgKTtcbiAgY29uc3QgcGFyc2VEaWFnbm9zdGljcyA9ICh0ZW1wU291cmNlRmlsZSBhcyBEaWFnbm9zdGljU291cmNlRmlsZSkucGFyc2VEaWFnbm9zdGljcztcblxuICBjb25zdCB0c09wdGlvbnM6IHRzLkNvbXBpbGVyT3B0aW9ucyA9IHtcbiAgICAvLyBXZSB0YXJnZXQgbGF0ZXN0IHNvIHRoYXQgdGhlcmUgaXMgbm8gZG93bmxldmVsaW5nLlxuICAgIHRhcmdldDogdHMuU2NyaXB0VGFyZ2V0LkxhdGVzdCxcbiAgICBpc29sYXRlZE1vZHVsZXM6IHRydWUsXG4gICAgc3VwcHJlc3NPdXRwdXRQYXRoQ2hlY2s6IHRydWUsXG4gICAgYWxsb3dOb25Uc0V4dGVuc2lvbnM6IHRydWUsXG4gICAgbm9MaWI6IHRydWUsXG4gICAgbm9SZXNvbHZlOiB0cnVlLFxuICAgIHNvdXJjZU1hcDogZW1pdFNvdXJjZU1hcCxcbiAgICBpbmxpbmVTb3VyY2VzOiBlbWl0U291cmNlTWFwLFxuICAgIGlubGluZVNvdXJjZU1hcDogZmFsc2UsXG4gIH07XG5cbiAgaWYgKGFsbG93RmFzdFBhdGggJiYgcGFyc2VEaWFnbm9zdGljcykge1xuICAgIGlmICghdmFsaWRhdGVEaWFnbm9zdGljcyhwYXJzZURpYWdub3N0aWNzLCBzdHJpY3QpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjb250ZW50OiBudWxsLFxuICAgICAgICBzb3VyY2VNYXA6IG51bGwsXG4gICAgICAgIGVtaXRTa2lwcGVkOiB0cnVlLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBBbGwgZmFzdCBwYXRoIHRyYW5zZm9ybWVycyBkbyBub3QgdXNlIGEgcHJvZ3JhbVxuICAgIGNvbnN0IHRyYW5zZm9ybXMgPSBnZXRUcmFuc2Zvcm1zLm1hcCgoZ2V0VGYpID0+IGdldFRmKC8qIHByb2dyYW0gKi8gdW5kZWZpbmVkKSk7XG5cbiAgICBjb25zdCByZXN1bHQgPSB0cy50cmFuc2Zvcm0odGVtcFNvdXJjZUZpbGUsIHRyYW5zZm9ybXMsIHRzT3B0aW9ucyk7XG4gICAgaWYgKHJlc3VsdC50cmFuc2Zvcm1lZC5sZW5ndGggPT09IDAgfHwgcmVzdWx0LnRyYW5zZm9ybWVkWzBdID09PSB0ZW1wU291cmNlRmlsZSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29udGVudDogbnVsbCxcbiAgICAgICAgc291cmNlTWFwOiBudWxsLFxuICAgICAgICBlbWl0U2tpcHBlZDogdHJ1ZSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgcHJpbnRlciA9IHRzLmNyZWF0ZVByaW50ZXIodW5kZWZpbmVkLCB7XG4gICAgICBvbkVtaXROb2RlOiByZXN1bHQuZW1pdE5vZGVXaXRoTm90aWZpY2F0aW9uLFxuICAgICAgc3Vic3RpdHV0ZU5vZGU6IHJlc3VsdC5zdWJzdGl0dXRlTm9kZSxcbiAgICB9KTtcblxuICAgIGNvbnN0IG91dHB1dCA9IHByaW50ZXIucHJpbnRGaWxlKHJlc3VsdC50cmFuc2Zvcm1lZFswXSk7XG5cbiAgICByZXN1bHQuZGlzcG9zZSgpO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNvbnRlbnQ6IG91dHB1dCxcbiAgICAgIHNvdXJjZU1hcDogbnVsbCxcbiAgICAgIGVtaXRTa2lwcGVkOiBmYWxzZSxcbiAgICB9O1xuICB9XG5cbiAgY29uc3QgaG9zdDogdHMuQ29tcGlsZXJIb3N0ID0ge1xuICAgIGdldFNvdXJjZUZpbGU6IChmaWxlTmFtZSkgPT4ge1xuICAgICAgaWYgKGZpbGVOYW1lICE9PSB0ZW1wRmlsZW5hbWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBGaWxlICR7ZmlsZU5hbWV9IGRvZXMgbm90IGhhdmUgYSBzb3VyY2VGaWxlLmApO1xuICAgICAgfVxuXG4gICAgICByZXR1cm4gdGVtcFNvdXJjZUZpbGU7XG4gICAgfSxcbiAgICBnZXREZWZhdWx0TGliRmlsZU5hbWU6ICgpID0+ICdsaWIuZC50cycsXG4gICAgZ2V0Q3VycmVudERpcmVjdG9yeTogKCkgPT4gJycsXG4gICAgZ2V0RGlyZWN0b3JpZXM6ICgpID0+IFtdLFxuICAgIGdldENhbm9uaWNhbEZpbGVOYW1lOiAoZmlsZU5hbWUpID0+IGZpbGVOYW1lLFxuICAgIHVzZUNhc2VTZW5zaXRpdmVGaWxlTmFtZXM6ICgpID0+IHRydWUsXG4gICAgZ2V0TmV3TGluZTogKCkgPT4gJ1xcbicsXG4gICAgZmlsZUV4aXN0czogKGZpbGVOYW1lKSA9PiBmaWxlTmFtZSA9PT0gdGVtcEZpbGVuYW1lLFxuICAgIHJlYWRGaWxlOiAoX2ZpbGVOYW1lKSA9PiAnJyxcbiAgICB3cml0ZUZpbGU6IChmaWxlTmFtZSwgdGV4dCkgPT4gb3V0cHV0cy5zZXQoZmlsZU5hbWUsIHRleHQpLFxuICB9O1xuXG4gIGNvbnN0IHByb2dyYW0gPSB0cy5jcmVhdGVQcm9ncmFtKFt0ZW1wRmlsZW5hbWVdLCB0c09wdGlvbnMsIGhvc3QpO1xuXG4gIGNvbnN0IGRpYWdub3N0aWNzID0gcHJvZ3JhbS5nZXRTeW50YWN0aWNEaWFnbm9zdGljcyh0ZW1wU291cmNlRmlsZSk7XG4gIGlmICghdmFsaWRhdGVEaWFnbm9zdGljcyhkaWFnbm9zdGljcywgc3RyaWN0KSkge1xuICAgIHJldHVybiB7XG4gICAgICBjb250ZW50OiBudWxsLFxuICAgICAgc291cmNlTWFwOiBudWxsLFxuICAgICAgZW1pdFNraXBwZWQ6IHRydWUsXG4gICAgfTtcbiAgfVxuXG4gIC8vIFdlIG5lZWQgdGhlIGNoZWNrZXIgaW5zaWRlIHRyYW5zZm9ybXMuXG4gIGNvbnN0IHRyYW5zZm9ybXMgPSBnZXRUcmFuc2Zvcm1zLm1hcCgoZ2V0VGYpID0+IGdldFRmKHByb2dyYW0pKTtcblxuICBwcm9ncmFtLmVtaXQodW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB7IGJlZm9yZTogdHJhbnNmb3JtcywgYWZ0ZXI6IFtdIH0pO1xuXG4gIGxldCB0cmFuc2Zvcm1lZENvbnRlbnQgPSBvdXRwdXRzLmdldCh0ZW1wRmlsZW5hbWUpO1xuXG4gIGlmICghdHJhbnNmb3JtZWRDb250ZW50KSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIGNvbnRlbnQ6IG51bGwsXG4gICAgICBzb3VyY2VNYXA6IG51bGwsXG4gICAgICBlbWl0U2tpcHBlZDogdHJ1ZSxcbiAgICB9O1xuICB9XG5cbiAgbGV0IHNvdXJjZU1hcDogUmF3U291cmNlTWFwIHwgbnVsbCA9IG51bGw7XG4gIGNvbnN0IHRzU291cmNlTWFwID0gb3V0cHV0cy5nZXQoYCR7dGVtcEZpbGVuYW1lfS5tYXBgKTtcblxuICBpZiAoZW1pdFNvdXJjZU1hcCAmJiB0c1NvdXJjZU1hcCkge1xuICAgIGNvbnN0IHVybFJlZ0V4cCA9IC9eXFwvXFwvIyBzb3VyY2VNYXBwaW5nVVJMPVteXFxyXFxuXSovZ207XG4gICAgc291cmNlTWFwID0gSlNPTi5wYXJzZSh0c1NvdXJjZU1hcCkgYXMgUmF3U291cmNlTWFwO1xuICAgIC8vIEZpeCBzb3VyY2VtYXBzIGZpbGUgcmVmZXJlbmNlcy5cbiAgICBpZiAob3V0cHV0RmlsZVBhdGgpIHtcbiAgICAgIHNvdXJjZU1hcC5maWxlID0gb3V0cHV0RmlsZVBhdGg7XG4gICAgICB0cmFuc2Zvcm1lZENvbnRlbnQgPSB0cmFuc2Zvcm1lZENvbnRlbnQucmVwbGFjZShcbiAgICAgICAgdXJsUmVnRXhwLFxuICAgICAgICBgLy8jIHNvdXJjZU1hcHBpbmdVUkw9JHtzb3VyY2VNYXAuZmlsZX0ubWFwXFxuYCxcbiAgICAgICk7XG4gICAgICBpZiAoaW5wdXRGaWxlUGF0aCkge1xuICAgICAgICBzb3VyY2VNYXAuc291cmNlcyA9IFtpbnB1dEZpbGVQYXRoXTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHNvdXJjZU1hcC5zb3VyY2VzID0gWycnXTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVE9ETzogZmlndXJlIG91dCBpZiB3ZSBzaG91bGQgaW5saW5lIHNvdXJjZXMgaGVyZS5cbiAgICAgIHRyYW5zZm9ybWVkQ29udGVudCA9IHRyYW5zZm9ybWVkQ29udGVudC5yZXBsYWNlKHVybFJlZ0V4cCwgJycpO1xuICAgICAgc291cmNlTWFwLmZpbGUgPSAnJztcbiAgICAgIHNvdXJjZU1hcC5zb3VyY2VzID0gWycnXTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGNvbnRlbnQ6IHRyYW5zZm9ybWVkQ29udGVudCxcbiAgICBzb3VyY2VNYXAsXG4gICAgZW1pdFNraXBwZWQ6IGZhbHNlLFxuICB9O1xufVxuIl19