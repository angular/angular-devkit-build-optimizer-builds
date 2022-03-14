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
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHJhbnNmb3JtLWphdmFzY3JpcHQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyX2RldmtpdC9idWlsZF9vcHRpbWl6ZXIvc3JjL2hlbHBlcnMvdHJhbnNmb3JtLWphdmFzY3JpcHQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFHSCwrQ0FBaUM7QUEwQmpDLFNBQVMsbUJBQW1CLENBQUMsV0FBeUMsRUFBRSxNQUFnQjtJQUN0RiwyQkFBMkI7SUFFM0IsTUFBTSxRQUFRLEdBQUcsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsS0FBSyxFQUFFLENBQUMsa0JBQWtCLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDM0YsSUFBSSxRQUFRLEVBQUU7UUFDWix5RUFBeUU7UUFDekUsSUFBSSxNQUFNLEVBQUU7WUFDVixNQUFNLGFBQWEsR0FBRyxFQUFFLENBQUMsaUJBQWlCLENBQUMsV0FBVyxFQUFFO2dCQUN0RCxtQkFBbUIsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsR0FBRyxDQUFDLG1CQUFtQixFQUFFO2dCQUN2RCxVQUFVLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLEdBQUcsQ0FBQyxPQUFPO2dCQUNoQyxvQkFBb0IsRUFBRSxDQUFDLENBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQzthQUN2QyxDQUFDLENBQUM7WUFFSCxNQUFNLElBQUksS0FBSyxDQUFDOzs7VUFHWixhQUFhO09BQ2hCLENBQUMsQ0FBQztTQUNKO2FBQU07WUFDTCxPQUFPLEtBQUssQ0FBQztTQUNkO0tBQ0Y7SUFFRCxPQUFPLElBQUksQ0FBQztBQUNkLENBQUM7QUFFRCxTQUFnQixtQkFBbUIsQ0FDakMsT0FBbUM7SUFFbkMsTUFBTSxFQUFFLE9BQU8sRUFB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QUMsRUFBRSxDQUFDLENBQUM7U0FDMUI7S0FDRjtJQUVELE9BQU87UUFDTCxPQUFPLEVBQUUsa0JBQWtCO1FBQzNCLFNBQVM7UUFDVCxXQUFXLEVBQUUsS0FBSztLQUNuQixDQUFDO0FBQ0osQ0FBQztBQXZKRCxrREF1SkMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0IHsgUmF3U291cmNlTWFwIH0gZnJvbSAnc291cmNlLW1hcCc7XG5pbXBvcnQgKiBhcyB0cyBmcm9tICd0eXBlc2NyaXB0JztcblxuZXhwb3J0IHR5cGUgVHJhbnNmb3JtZXJGYWN0b3J5Q3JlYXRvciA9IChcbiAgcHJvZ3JhbT86IHRzLlByb2dyYW0sXG4pID0+IHRzLlRyYW5zZm9ybWVyRmFjdG9yeTx0cy5Tb3VyY2VGaWxlPjtcblxuZXhwb3J0IGludGVyZmFjZSBUcmFuc2Zvcm1KYXZhc2NyaXB0T3B0aW9ucyB7XG4gIGNvbnRlbnQ6IHN0cmluZztcbiAgaW5wdXRGaWxlUGF0aD86IHN0cmluZztcbiAgb3V0cHV0RmlsZVBhdGg/OiBzdHJpbmc7XG4gIGVtaXRTb3VyY2VNYXA/OiBib29sZWFuO1xuICBzdHJpY3Q/OiBib29sZWFuO1xuICB0eXBlQ2hlY2s/OiBib29sZWFuO1xuICBnZXRUcmFuc2Zvcm1zOiBUcmFuc2Zvcm1lckZhY3RvcnlDcmVhdG9yW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgVHJhbnNmb3JtSmF2YXNjcmlwdE91dHB1dCB7XG4gIGNvbnRlbnQ6IHN0cmluZyB8IG51bGw7XG4gIHNvdXJjZU1hcDogUmF3U291cmNlTWFwIHwgbnVsbDtcbiAgZW1pdFNraXBwZWQ6IGJvb2xlYW47XG59XG5cbmludGVyZmFjZSBEaWFnbm9zdGljU291cmNlRmlsZSBleHRlbmRzIHRzLlNvdXJjZUZpbGUge1xuICByZWFkb25seSBwYXJzZURpYWdub3N0aWNzPzogUmVhZG9ubHlBcnJheTx0cy5EaWFnbm9zdGljPjtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVEaWFnbm9zdGljcyhkaWFnbm9zdGljczogUmVhZG9ubHlBcnJheTx0cy5EaWFnbm9zdGljPiwgc3RyaWN0PzogYm9vbGVhbik6IGJvb2xlYW4ge1xuICAvLyBQcmludCBlcnJvciBkaWFnbm9zdGljcy5cblxuICBjb25zdCBoYXNFcnJvciA9IGRpYWdub3N0aWNzLnNvbWUoKGRpYWcpID0+IGRpYWcuY2F0ZWdvcnkgPT09IHRzLkRpYWdub3N0aWNDYXRlZ29yeS5FcnJvcik7XG4gIGlmIChoYXNFcnJvcikge1xuICAgIC8vIFRocm93IG9ubHkgaWYgd2UncmUgaW4gc3RyaWN0IG1vZGUsIG90aGVyd2lzZSByZXR1cm4gb3JpZ2luYWwgY29udGVudC5cbiAgICBpZiAoc3RyaWN0KSB7XG4gICAgICBjb25zdCBlcnJvck1lc3NhZ2VzID0gdHMuZm9ybWF0RGlhZ25vc3RpY3MoZGlhZ25vc3RpY3MsIHtcbiAgICAgICAgZ2V0Q3VycmVudERpcmVjdG9yeTogKCkgPT4gdHMuc3lzLmdldEN1cnJlbnREaXJlY3RvcnkoKSxcbiAgICAgICAgZ2V0TmV3TGluZTogKCkgPT4gdHMuc3lzLm5ld0xpbmUsXG4gICAgICAgIGdldENhbm9uaWNhbEZpbGVOYW1lOiAoZjogc3RyaW5nKSA9PiBmLFxuICAgICAgfSk7XG5cbiAgICAgIHRocm93IG5ldyBFcnJvcihgXG4gICAgICAgIFRTIGZhaWxlZCB3aXRoIHRoZSBmb2xsb3dpbmcgZXJyb3IgbWVzc2FnZXM6XG5cbiAgICAgICAgJHtlcnJvck1lc3NhZ2VzfVxuICAgICAgYCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRyYW5zZm9ybUphdmFzY3JpcHQoXG4gIG9wdGlvbnM6IFRyYW5zZm9ybUphdmFzY3JpcHRPcHRpb25zLFxuKTogVHJhbnNmb3JtSmF2YXNjcmlwdE91dHB1dCB7XG4gIGNvbnN0IHsgY29udGVudCwgZ2V0VHJhbnNmb3JtcywgZW1pdFNvdXJjZU1hcCwgaW5wdXRGaWxlUGF0aCwgb3V0cHV0RmlsZVBhdGgsIHN0cmljdCB9ID0gb3B0aW9ucztcblxuICAvLyBCYWlsIGlmIHRoZXJlJ3Mgbm8gdHJhbnNmb3JtIHRvIGRvLlxuICBpZiAoZ2V0VHJhbnNmb3Jtcy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4ge1xuICAgICAgY29udGVudDogbnVsbCxcbiAgICAgIHNvdXJjZU1hcDogbnVsbCxcbiAgICAgIGVtaXRTa2lwcGVkOiB0cnVlLFxuICAgIH07XG4gIH1cblxuICBjb25zdCBhbGxvd0Zhc3RQYXRoID0gb3B0aW9ucy50eXBlQ2hlY2sgPT09IGZhbHNlICYmICFlbWl0U291cmNlTWFwO1xuICBjb25zdCBvdXRwdXRzID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcbiAgY29uc3QgdGVtcEZpbGVuYW1lID0gJ2JvLWRlZmF1bHQtZmlsZS5qcyc7XG4gIGNvbnN0IHRlbXBTb3VyY2VGaWxlID0gdHMuY3JlYXRlU291cmNlRmlsZShcbiAgICB0ZW1wRmlsZW5hbWUsXG4gICAgY29udGVudCxcbiAgICB0cy5TY3JpcHRUYXJnZXQuTGF0ZXN0LFxuICAgIGFsbG93RmFzdFBhdGgsXG4gICk7XG4gIGNvbnN0IHBhcnNlRGlhZ25vc3RpY3MgPSAodGVtcFNvdXJjZUZpbGUgYXMgRGlhZ25vc3RpY1NvdXJjZUZpbGUpLnBhcnNlRGlhZ25vc3RpY3M7XG5cbiAgY29uc3QgdHNPcHRpb25zOiB0cy5Db21waWxlck9wdGlvbnMgPSB7XG4gICAgLy8gV2UgdGFyZ2V0IGxhdGVzdCBzbyB0aGF0IHRoZXJlIGlzIG5vIGRvd25sZXZlbGluZy5cbiAgICB0YXJnZXQ6IHRzLlNjcmlwdFRhcmdldC5MYXRlc3QsXG4gICAgaXNvbGF0ZWRNb2R1bGVzOiB0cnVlLFxuICAgIHN1cHByZXNzT3V0cHV0UGF0aENoZWNrOiB0cnVlLFxuICAgIGFsbG93Tm9uVHNFeHRlbnNpb25zOiB0cnVlLFxuICAgIG5vTGliOiB0cnVlLFxuICAgIG5vUmVzb2x2ZTogdHJ1ZSxcbiAgICBzb3VyY2VNYXA6IGVtaXRTb3VyY2VNYXAsXG4gICAgaW5saW5lU291cmNlczogZW1pdFNvdXJjZU1hcCxcbiAgICBpbmxpbmVTb3VyY2VNYXA6IGZhbHNlLFxuICB9O1xuXG4gIGlmIChhbGxvd0Zhc3RQYXRoICYmIHBhcnNlRGlhZ25vc3RpY3MpIHtcbiAgICBpZiAoIXZhbGlkYXRlRGlhZ25vc3RpY3MocGFyc2VEaWFnbm9zdGljcywgc3RyaWN0KSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29udGVudDogbnVsbCxcbiAgICAgICAgc291cmNlTWFwOiBudWxsLFxuICAgICAgICBlbWl0U2tpcHBlZDogdHJ1ZSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gQWxsIGZhc3QgcGF0aCB0cmFuc2Zvcm1lcnMgZG8gbm90IHVzZSBhIHByb2dyYW1cbiAgICBjb25zdCB0cmFuc2Zvcm1zID0gZ2V0VHJhbnNmb3Jtcy5tYXAoKGdldFRmKSA9PiBnZXRUZigvKiBwcm9ncmFtICovIHVuZGVmaW5lZCkpO1xuXG4gICAgY29uc3QgcmVzdWx0ID0gdHMudHJhbnNmb3JtKHRlbXBTb3VyY2VGaWxlLCB0cmFuc2Zvcm1zLCB0c09wdGlvbnMpO1xuICAgIGlmIChyZXN1bHQudHJhbnNmb3JtZWQubGVuZ3RoID09PSAwIHx8IHJlc3VsdC50cmFuc2Zvcm1lZFswXSA9PT0gdGVtcFNvdXJjZUZpbGUpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvbnRlbnQ6IG51bGwsXG4gICAgICAgIHNvdXJjZU1hcDogbnVsbCxcbiAgICAgICAgZW1pdFNraXBwZWQ6IHRydWUsXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNvbnN0IHByaW50ZXIgPSB0cy5jcmVhdGVQcmludGVyKHVuZGVmaW5lZCwge1xuICAgICAgb25FbWl0Tm9kZTogcmVzdWx0LmVtaXROb2RlV2l0aE5vdGlmaWNhdGlvbixcbiAgICAgIHN1YnN0aXR1dGVOb2RlOiByZXN1bHQuc3Vic3RpdHV0ZU5vZGUsXG4gICAgfSk7XG5cbiAgICBjb25zdCBvdXRwdXQgPSBwcmludGVyLnByaW50RmlsZShyZXN1bHQudHJhbnNmb3JtZWRbMF0pO1xuXG4gICAgcmVzdWx0LmRpc3Bvc2UoKTtcblxuICAgIHJldHVybiB7XG4gICAgICBjb250ZW50OiBvdXRwdXQsXG4gICAgICBzb3VyY2VNYXA6IG51bGwsXG4gICAgICBlbWl0U2tpcHBlZDogZmFsc2UsXG4gICAgfTtcbiAgfVxuXG4gIGNvbnN0IGhvc3Q6IHRzLkNvbXBpbGVySG9zdCA9IHtcbiAgICBnZXRTb3VyY2VGaWxlOiAoZmlsZU5hbWUpID0+IHtcbiAgICAgIGlmIChmaWxlTmFtZSAhPT0gdGVtcEZpbGVuYW1lKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgRmlsZSAke2ZpbGVOYW1lfSBkb2VzIG5vdCBoYXZlIGEgc291cmNlRmlsZS5gKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHRlbXBTb3VyY2VGaWxlO1xuICAgIH0sXG4gICAgZ2V0RGVmYXVsdExpYkZpbGVOYW1lOiAoKSA9PiAnbGliLmQudHMnLFxuICAgIGdldEN1cnJlbnREaXJlY3Rvcnk6ICgpID0+ICcnLFxuICAgIGdldERpcmVjdG9yaWVzOiAoKSA9PiBbXSxcbiAgICBnZXRDYW5vbmljYWxGaWxlTmFtZTogKGZpbGVOYW1lKSA9PiBmaWxlTmFtZSxcbiAgICB1c2VDYXNlU2Vuc2l0aXZlRmlsZU5hbWVzOiAoKSA9PiB0cnVlLFxuICAgIGdldE5ld0xpbmU6ICgpID0+ICdcXG4nLFxuICAgIGZpbGVFeGlzdHM6IChmaWxlTmFtZSkgPT4gZmlsZU5hbWUgPT09IHRlbXBGaWxlbmFtZSxcbiAgICByZWFkRmlsZTogKF9maWxlTmFtZSkgPT4gJycsXG4gICAgd3JpdGVGaWxlOiAoZmlsZU5hbWUsIHRleHQpID0+IG91dHB1dHMuc2V0KGZpbGVOYW1lLCB0ZXh0KSxcbiAgfTtcblxuICBjb25zdCBwcm9ncmFtID0gdHMuY3JlYXRlUHJvZ3JhbShbdGVtcEZpbGVuYW1lXSwgdHNPcHRpb25zLCBob3N0KTtcblxuICBjb25zdCBkaWFnbm9zdGljcyA9IHByb2dyYW0uZ2V0U3ludGFjdGljRGlhZ25vc3RpY3ModGVtcFNvdXJjZUZpbGUpO1xuICBpZiAoIXZhbGlkYXRlRGlhZ25vc3RpY3MoZGlhZ25vc3RpY3MsIHN0cmljdCkpIHtcbiAgICByZXR1cm4ge1xuICAgICAgY29udGVudDogbnVsbCxcbiAgICAgIHNvdXJjZU1hcDogbnVsbCxcbiAgICAgIGVtaXRTa2lwcGVkOiB0cnVlLFxuICAgIH07XG4gIH1cblxuICAvLyBXZSBuZWVkIHRoZSBjaGVja2VyIGluc2lkZSB0cmFuc2Zvcm1zLlxuICBjb25zdCB0cmFuc2Zvcm1zID0gZ2V0VHJhbnNmb3Jtcy5tYXAoKGdldFRmKSA9PiBnZXRUZihwcm9ncmFtKSk7XG5cbiAgcHJvZ3JhbS5lbWl0KHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgeyBiZWZvcmU6IHRyYW5zZm9ybXMsIGFmdGVyOiBbXSB9KTtcblxuICBsZXQgdHJhbnNmb3JtZWRDb250ZW50ID0gb3V0cHV0cy5nZXQodGVtcEZpbGVuYW1lKTtcblxuICBpZiAoIXRyYW5zZm9ybWVkQ29udGVudCkge1xuICAgIHJldHVybiB7XG4gICAgICBjb250ZW50OiBudWxsLFxuICAgICAgc291cmNlTWFwOiBudWxsLFxuICAgICAgZW1pdFNraXBwZWQ6IHRydWUsXG4gICAgfTtcbiAgfVxuXG4gIGxldCBzb3VyY2VNYXA6IFJhd1NvdXJjZU1hcCB8IG51bGwgPSBudWxsO1xuICBjb25zdCB0c1NvdXJjZU1hcCA9IG91dHB1dHMuZ2V0KGAke3RlbXBGaWxlbmFtZX0ubWFwYCk7XG5cbiAgaWYgKGVtaXRTb3VyY2VNYXAgJiYgdHNTb3VyY2VNYXApIHtcbiAgICBjb25zdCB1cmxSZWdFeHAgPSAvXlxcL1xcLyMgc291cmNlTWFwcGluZ1VSTD1bXlxcclxcbl0qL2dtO1xuICAgIHNvdXJjZU1hcCA9IEpTT04ucGFyc2UodHNTb3VyY2VNYXApIGFzIFJhd1NvdXJjZU1hcDtcbiAgICAvLyBGaXggc291cmNlbWFwcyBmaWxlIHJlZmVyZW5jZXMuXG4gICAgaWYgKG91dHB1dEZpbGVQYXRoKSB7XG4gICAgICBzb3VyY2VNYXAuZmlsZSA9IG91dHB1dEZpbGVQYXRoO1xuICAgICAgdHJhbnNmb3JtZWRDb250ZW50ID0gdHJhbnNmb3JtZWRDb250ZW50LnJlcGxhY2UoXG4gICAgICAgIHVybFJlZ0V4cCxcbiAgICAgICAgYC8vIyBzb3VyY2VNYXBwaW5nVVJMPSR7c291cmNlTWFwLmZpbGV9Lm1hcFxcbmAsXG4gICAgICApO1xuICAgICAgaWYgKGlucHV0RmlsZVBhdGgpIHtcbiAgICAgICAgc291cmNlTWFwLnNvdXJjZXMgPSBbaW5wdXRGaWxlUGF0aF07XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBzb3VyY2VNYXAuc291cmNlcyA9IFsnJ107XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFRPRE86IGZpZ3VyZSBvdXQgaWYgd2Ugc2hvdWxkIGlubGluZSBzb3VyY2VzIGhlcmUuXG4gICAgICB0cmFuc2Zvcm1lZENvbnRlbnQgPSB0cmFuc2Zvcm1lZENvbnRlbnQucmVwbGFjZSh1cmxSZWdFeHAsICcnKTtcbiAgICAgIHNvdXJjZU1hcC5maWxlID0gJyc7XG4gICAgICBzb3VyY2VNYXAuc291cmNlcyA9IFsnJ107XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtcbiAgICBjb250ZW50OiB0cmFuc2Zvcm1lZENvbnRlbnQsXG4gICAgc291cmNlTWFwLFxuICAgIGVtaXRTa2lwcGVkOiBmYWxzZSxcbiAgfTtcbn1cbiJdfQ==