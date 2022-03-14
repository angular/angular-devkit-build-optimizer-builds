"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOptimizer = void 0;
const fs_1 = require("fs");
const transform_javascript_1 = require("../helpers/transform-javascript");
const prefix_classes_1 = require("../transforms/prefix-classes");
const prefix_functions_1 = require("../transforms/prefix-functions");
const scrub_file_1 = require("../transforms/scrub-file");
const wrap_enums_1 = require("../transforms/wrap-enums");
// Angular packages are known to have no side effects.
const knownSideEffectFreeAngularModules = [
    /[\\/]node_modules[\\/]@angular[\\/]animations[\\/]/,
    /[\\/]node_modules[\\/]@angular[\\/]common[\\/]/,
    /[\\/]node_modules[\\/]@angular[\\/]compiler[\\/]/,
    /[\\/]node_modules[\\/]@angular[\\/]core[\\/]/,
    /[\\/]node_modules[\\/]@angular[\\/]forms[\\/]/,
    /[\\/]node_modules[\\/]@angular[\\/]http[\\/]/,
    /[\\/]node_modules[\\/]@angular[\\/]platform-browser-dynamic[\\/]/,
    /[\\/]node_modules[\\/]@angular[\\/]platform-browser[\\/]/,
    /[\\/]node_modules[\\/]@angular[\\/]platform-webworker-dynamic[\\/]/,
    /[\\/]node_modules[\\/]@angular[\\/]platform-webworker[\\/]/,
    /[\\/]node_modules[\\/]@angular[\\/]router[\\/]/,
    /[\\/]node_modules[\\/]@angular[\\/]upgrade[\\/]/,
    /[\\/]node_modules[\\/]@angular[\\/]material[\\/]/,
    /[\\/]node_modules[\\/]@angular[\\/]cdk[\\/]/,
    /[\\/]node_modules[\\/]rxjs[\\/]/,
];
// Known locations for the source files of @angular/core.
const coreFilesRegex = /[\\/]node_modules[\\/]@angular[\\/]core[\\/][f]?esm2015[\\/]/;
function isKnownCoreFile(filePath) {
    return coreFilesRegex.test(filePath);
}
function isKnownSideEffectFree(filePath) {
    // rxjs add imports contain intentional side effects
    if (/[\\/]node_modules[\\/]rxjs[\\/]add[\\/]/.test(filePath)) {
        return false;
    }
    return knownSideEffectFreeAngularModules.some((re) => re.test(filePath));
}
function buildOptimizer(options) {
    const { inputFilePath } = options;
    let { originalFilePath, content, isAngularCoreFile } = options;
    if (!originalFilePath && inputFilePath) {
        originalFilePath = inputFilePath;
    }
    if (!inputFilePath && content === undefined) {
        throw new Error('Either filePath or content must be specified in options.');
    }
    if (content === undefined) {
        content = (0, fs_1.readFileSync)(inputFilePath, 'UTF-8');
    }
    if (!content) {
        return {
            content: null,
            sourceMap: null,
            emitSkipped: true,
        };
    }
    if (isAngularCoreFile === undefined) {
        isAngularCoreFile = !!originalFilePath && isKnownCoreFile(originalFilePath);
    }
    const hasSafeSideEffects = originalFilePath && isKnownSideEffectFree(originalFilePath);
    // Determine which transforms to apply.
    const getTransforms = [];
    let typeCheck = false;
    if (hasSafeSideEffects) {
        // Angular modules have known safe side effects
        getTransforms.push(
        // getPrefixFunctionsTransformer is rather dangerous, apply only to known pure es5 modules.
        // It will mark both `require()` calls and `console.log(stuff)` as pure.
        // We only apply it to modules known to be side effect free, since we know they are safe.
        prefix_functions_1.getPrefixFunctionsTransformer);
        typeCheck = true;
    }
    else if ((0, prefix_classes_1.testPrefixClasses)(content)) {
        // This is only relevant if prefix functions is not used since prefix functions will prefix IIFE wrapped classes.
        getTransforms.unshift(prefix_classes_1.getPrefixClassesTransformer);
    }
    if ((0, scrub_file_1.testScrubFile)(content)) {
        // Always test as these require the type checker
        getTransforms.push((0, scrub_file_1.createScrubFileTransformerFactory)(isAngularCoreFile));
        typeCheck = true;
    }
    getTransforms.push(wrap_enums_1.getWrapEnumsTransformer);
    const transformJavascriptOpts = {
        content: content,
        inputFilePath: options.inputFilePath,
        outputFilePath: options.outputFilePath,
        emitSourceMap: options.emitSourceMap,
        strict: options.strict,
        getTransforms,
        typeCheck,
    };
    return (0, transform_javascript_1.transformJavascript)(transformJavascriptOpts);
}
exports.buildOptimizer = buildOptimizer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYnVpbGQtb3B0aW1pemVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYnVpbGRfb3B0aW1pemVyL3NyYy9idWlsZC1vcHRpbWl6ZXIvYnVpbGQtb3B0aW1pemVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7OztBQUVILDJCQUFrQztBQUNsQywwRUFLeUM7QUFDekMsaUVBQThGO0FBQzlGLHFFQUErRTtBQUMvRSx5REFBNEY7QUFDNUYseURBQW1FO0FBRW5FLHNEQUFzRDtBQUN0RCxNQUFNLGlDQUFpQyxHQUFHO0lBQ3hDLG9EQUFvRDtJQUNwRCxnREFBZ0Q7SUFDaEQsa0RBQWtEO0lBQ2xELDhDQUE4QztJQUM5QywrQ0FBK0M7SUFDL0MsOENBQThDO0lBQzlDLGtFQUFrRTtJQUNsRSwwREFBMEQ7SUFDMUQsb0VBQW9FO0lBQ3BFLDREQUE0RDtJQUM1RCxnREFBZ0Q7SUFDaEQsaURBQWlEO0lBQ2pELGtEQUFrRDtJQUNsRCw2Q0FBNkM7SUFDN0MsaUNBQWlDO0NBQ2xDLENBQUM7QUFFRix5REFBeUQ7QUFDekQsTUFBTSxjQUFjLEdBQUcsOERBQThELENBQUM7QUFFdEYsU0FBUyxlQUFlLENBQUMsUUFBZ0I7SUFDdkMsT0FBTyxjQUFjLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQ3ZDLENBQUM7QUFFRCxTQUFTLHFCQUFxQixDQUFDLFFBQWdCO0lBQzdDLG9EQUFvRDtJQUNwRCxJQUFJLHlDQUF5QyxDQUFDLElBQUksQ0FBQyxRQUFRLENBQUMsRUFBRTtRQUM1RCxPQUFPLEtBQUssQ0FBQztLQUNkO0lBRUQsT0FBTyxpQ0FBaUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztBQUMzRSxDQUFDO0FBYUQsU0FBZ0IsY0FBYyxDQUFDLE9BQThCO0lBQzNELE1BQU0sRUFBRSxhQUFhLEVBQUUsR0FBRyxPQUFPLENBQUM7SUFDbEMsSUFBSSxFQUFFLGdCQUFnQixFQUFFLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxHQUFHLE9BQU8sQ0FBQztJQUUvRCxJQUFJLENBQUMsZ0JBQWdCLElBQUksYUFBYSxFQUFFO1FBQ3RDLGdCQUFnQixHQUFHLGFBQWEsQ0FBQztLQUNsQztJQUVELElBQUksQ0FBQyxhQUFhLElBQUksT0FBTyxLQUFLLFNBQVMsRUFBRTtRQUMzQyxNQUFNLElBQUksS0FBSyxDQUFDLDBEQUEwRCxDQUFDLENBQUM7S0FDN0U7SUFFRCxJQUFJLE9BQU8sS0FBSyxTQUFTLEVBQUU7UUFDekIsT0FBTyxHQUFHLElBQUEsaUJBQVksRUFBQyxhQUF1QixFQUFFLE9BQU8sQ0FBQyxDQUFDO0tBQzFEO0lBRUQsSUFBSSxDQUFDLE9BQU8sRUFBRTtRQUNaLE9BQU87WUFDTCxPQUFPLEVBQUUsSUFBSTtZQUNiLFNBQVMsRUFBRSxJQUFJO1lBQ2YsV0FBVyxFQUFFLElBQUk7U0FDbEIsQ0FBQztLQUNIO0lBRUQsSUFBSSxpQkFBaUIsS0FBSyxTQUFTLEVBQUU7UUFDbkMsaUJBQWlCLEdBQUcsQ0FBQyxDQUFDLGdCQUFnQixJQUFJLGVBQWUsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0tBQzdFO0lBRUQsTUFBTSxrQkFBa0IsR0FBRyxnQkFBZ0IsSUFBSSxxQkFBcUIsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBRXZGLHVDQUF1QztJQUN2QyxNQUFNLGFBQWEsR0FBZ0MsRUFBRSxDQUFDO0lBRXRELElBQUksU0FBUyxHQUFHLEtBQUssQ0FBQztJQUN0QixJQUFJLGtCQUFrQixFQUFFO1FBQ3RCLCtDQUErQztRQUMvQyxhQUFhLENBQUMsSUFBSTtRQUNoQiwyRkFBMkY7UUFDM0Ysd0VBQXdFO1FBQ3hFLHlGQUF5RjtRQUN6RixnREFBNkIsQ0FDOUIsQ0FBQztRQUNGLFNBQVMsR0FBRyxJQUFJLENBQUM7S0FDbEI7U0FBTSxJQUFJLElBQUEsa0NBQWlCLEVBQUMsT0FBTyxDQUFDLEVBQUU7UUFDckMsaUhBQWlIO1FBQ2pILGFBQWEsQ0FBQyxPQUFPLENBQUMsNENBQTJCLENBQUMsQ0FBQztLQUNwRDtJQUVELElBQUksSUFBQSwwQkFBYSxFQUFDLE9BQU8sQ0FBQyxFQUFFO1FBQzFCLGdEQUFnRDtRQUNoRCxhQUFhLENBQUMsSUFBSSxDQUFDLElBQUEsOENBQWlDLEVBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDO1FBQ3pFLFNBQVMsR0FBRyxJQUFJLENBQUM7S0FDbEI7SUFFRCxhQUFhLENBQUMsSUFBSSxDQUFDLG9DQUF1QixDQUFDLENBQUM7SUFFNUMsTUFBTSx1QkFBdUIsR0FBK0I7UUFDMUQsT0FBTyxFQUFFLE9BQU87UUFDaEIsYUFBYSxFQUFFLE9BQU8sQ0FBQyxhQUFhO1FBQ3BDLGNBQWMsRUFBRSxPQUFPLENBQUMsY0FBYztRQUN0QyxhQUFhLEVBQUUsT0FBTyxDQUFDLGFBQWE7UUFDcEMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxNQUFNO1FBQ3RCLGFBQWE7UUFDYixTQUFTO0tBQ1YsQ0FBQztJQUVGLE9BQU8sSUFBQSwwQ0FBbUIsRUFBQyx1QkFBdUIsQ0FBQyxDQUFDO0FBQ3RELENBQUM7QUFuRUQsd0NBbUVDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7IHJlYWRGaWxlU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7XG4gIFRyYW5zZm9ybUphdmFzY3JpcHRPcHRpb25zLFxuICBUcmFuc2Zvcm1KYXZhc2NyaXB0T3V0cHV0LFxuICBUcmFuc2Zvcm1lckZhY3RvcnlDcmVhdG9yLFxuICB0cmFuc2Zvcm1KYXZhc2NyaXB0LFxufSBmcm9tICcuLi9oZWxwZXJzL3RyYW5zZm9ybS1qYXZhc2NyaXB0JztcbmltcG9ydCB7IGdldFByZWZpeENsYXNzZXNUcmFuc2Zvcm1lciwgdGVzdFByZWZpeENsYXNzZXMgfSBmcm9tICcuLi90cmFuc2Zvcm1zL3ByZWZpeC1jbGFzc2VzJztcbmltcG9ydCB7IGdldFByZWZpeEZ1bmN0aW9uc1RyYW5zZm9ybWVyIH0gZnJvbSAnLi4vdHJhbnNmb3Jtcy9wcmVmaXgtZnVuY3Rpb25zJztcbmltcG9ydCB7IGNyZWF0ZVNjcnViRmlsZVRyYW5zZm9ybWVyRmFjdG9yeSwgdGVzdFNjcnViRmlsZSB9IGZyb20gJy4uL3RyYW5zZm9ybXMvc2NydWItZmlsZSc7XG5pbXBvcnQgeyBnZXRXcmFwRW51bXNUcmFuc2Zvcm1lciB9IGZyb20gJy4uL3RyYW5zZm9ybXMvd3JhcC1lbnVtcyc7XG5cbi8vIEFuZ3VsYXIgcGFja2FnZXMgYXJlIGtub3duIHRvIGhhdmUgbm8gc2lkZSBlZmZlY3RzLlxuY29uc3Qga25vd25TaWRlRWZmZWN0RnJlZUFuZ3VsYXJNb2R1bGVzID0gW1xuICAvW1xcXFwvXW5vZGVfbW9kdWxlc1tcXFxcL11AYW5ndWxhcltcXFxcL11hbmltYXRpb25zW1xcXFwvXS8sXG4gIC9bXFxcXC9dbm9kZV9tb2R1bGVzW1xcXFwvXUBhbmd1bGFyW1xcXFwvXWNvbW1vbltcXFxcL10vLFxuICAvW1xcXFwvXW5vZGVfbW9kdWxlc1tcXFxcL11AYW5ndWxhcltcXFxcL11jb21waWxlcltcXFxcL10vLFxuICAvW1xcXFwvXW5vZGVfbW9kdWxlc1tcXFxcL11AYW5ndWxhcltcXFxcL11jb3JlW1xcXFwvXS8sXG4gIC9bXFxcXC9dbm9kZV9tb2R1bGVzW1xcXFwvXUBhbmd1bGFyW1xcXFwvXWZvcm1zW1xcXFwvXS8sXG4gIC9bXFxcXC9dbm9kZV9tb2R1bGVzW1xcXFwvXUBhbmd1bGFyW1xcXFwvXWh0dHBbXFxcXC9dLyxcbiAgL1tcXFxcL11ub2RlX21vZHVsZXNbXFxcXC9dQGFuZ3VsYXJbXFxcXC9dcGxhdGZvcm0tYnJvd3Nlci1keW5hbWljW1xcXFwvXS8sXG4gIC9bXFxcXC9dbm9kZV9tb2R1bGVzW1xcXFwvXUBhbmd1bGFyW1xcXFwvXXBsYXRmb3JtLWJyb3dzZXJbXFxcXC9dLyxcbiAgL1tcXFxcL11ub2RlX21vZHVsZXNbXFxcXC9dQGFuZ3VsYXJbXFxcXC9dcGxhdGZvcm0td2Vid29ya2VyLWR5bmFtaWNbXFxcXC9dLyxcbiAgL1tcXFxcL11ub2RlX21vZHVsZXNbXFxcXC9dQGFuZ3VsYXJbXFxcXC9dcGxhdGZvcm0td2Vid29ya2VyW1xcXFwvXS8sXG4gIC9bXFxcXC9dbm9kZV9tb2R1bGVzW1xcXFwvXUBhbmd1bGFyW1xcXFwvXXJvdXRlcltcXFxcL10vLFxuICAvW1xcXFwvXW5vZGVfbW9kdWxlc1tcXFxcL11AYW5ndWxhcltcXFxcL111cGdyYWRlW1xcXFwvXS8sXG4gIC9bXFxcXC9dbm9kZV9tb2R1bGVzW1xcXFwvXUBhbmd1bGFyW1xcXFwvXW1hdGVyaWFsW1xcXFwvXS8sXG4gIC9bXFxcXC9dbm9kZV9tb2R1bGVzW1xcXFwvXUBhbmd1bGFyW1xcXFwvXWNka1tcXFxcL10vLFxuICAvW1xcXFwvXW5vZGVfbW9kdWxlc1tcXFxcL11yeGpzW1xcXFwvXS8sXG5dO1xuXG4vLyBLbm93biBsb2NhdGlvbnMgZm9yIHRoZSBzb3VyY2UgZmlsZXMgb2YgQGFuZ3VsYXIvY29yZS5cbmNvbnN0IGNvcmVGaWxlc1JlZ2V4ID0gL1tcXFxcL11ub2RlX21vZHVsZXNbXFxcXC9dQGFuZ3VsYXJbXFxcXC9dY29yZVtcXFxcL11bZl0/ZXNtMjAxNVtcXFxcL10vO1xuXG5mdW5jdGlvbiBpc0tub3duQ29yZUZpbGUoZmlsZVBhdGg6IHN0cmluZykge1xuICByZXR1cm4gY29yZUZpbGVzUmVnZXgudGVzdChmaWxlUGF0aCk7XG59XG5cbmZ1bmN0aW9uIGlzS25vd25TaWRlRWZmZWN0RnJlZShmaWxlUGF0aDogc3RyaW5nKSB7XG4gIC8vIHJ4anMgYWRkIGltcG9ydHMgY29udGFpbiBpbnRlbnRpb25hbCBzaWRlIGVmZmVjdHNcbiAgaWYgKC9bXFxcXC9dbm9kZV9tb2R1bGVzW1xcXFwvXXJ4anNbXFxcXC9dYWRkW1xcXFwvXS8udGVzdChmaWxlUGF0aCkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICByZXR1cm4ga25vd25TaWRlRWZmZWN0RnJlZUFuZ3VsYXJNb2R1bGVzLnNvbWUoKHJlKSA9PiByZS50ZXN0KGZpbGVQYXRoKSk7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgQnVpbGRPcHRpbWl6ZXJPcHRpb25zIHtcbiAgY29udGVudD86IHN0cmluZztcbiAgb3JpZ2luYWxGaWxlUGF0aD86IHN0cmluZztcbiAgaW5wdXRGaWxlUGF0aD86IHN0cmluZztcbiAgb3V0cHV0RmlsZVBhdGg/OiBzdHJpbmc7XG4gIGVtaXRTb3VyY2VNYXA/OiBib29sZWFuO1xuICBzdHJpY3Q/OiBib29sZWFuO1xuICBpc1NpZGVFZmZlY3RGcmVlPzogYm9vbGVhbjtcbiAgaXNBbmd1bGFyQ29yZUZpbGU/OiBib29sZWFuO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRPcHRpbWl6ZXIob3B0aW9uczogQnVpbGRPcHRpbWl6ZXJPcHRpb25zKTogVHJhbnNmb3JtSmF2YXNjcmlwdE91dHB1dCB7XG4gIGNvbnN0IHsgaW5wdXRGaWxlUGF0aCB9ID0gb3B0aW9ucztcbiAgbGV0IHsgb3JpZ2luYWxGaWxlUGF0aCwgY29udGVudCwgaXNBbmd1bGFyQ29yZUZpbGUgfSA9IG9wdGlvbnM7XG5cbiAgaWYgKCFvcmlnaW5hbEZpbGVQYXRoICYmIGlucHV0RmlsZVBhdGgpIHtcbiAgICBvcmlnaW5hbEZpbGVQYXRoID0gaW5wdXRGaWxlUGF0aDtcbiAgfVxuXG4gIGlmICghaW5wdXRGaWxlUGF0aCAmJiBjb250ZW50ID09PSB1bmRlZmluZWQpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0VpdGhlciBmaWxlUGF0aCBvciBjb250ZW50IG11c3QgYmUgc3BlY2lmaWVkIGluIG9wdGlvbnMuJyk7XG4gIH1cblxuICBpZiAoY29udGVudCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgY29udGVudCA9IHJlYWRGaWxlU3luYyhpbnB1dEZpbGVQYXRoIGFzIHN0cmluZywgJ1VURi04Jyk7XG4gIH1cblxuICBpZiAoIWNvbnRlbnQpIHtcbiAgICByZXR1cm4ge1xuICAgICAgY29udGVudDogbnVsbCxcbiAgICAgIHNvdXJjZU1hcDogbnVsbCxcbiAgICAgIGVtaXRTa2lwcGVkOiB0cnVlLFxuICAgIH07XG4gIH1cblxuICBpZiAoaXNBbmd1bGFyQ29yZUZpbGUgPT09IHVuZGVmaW5lZCkge1xuICAgIGlzQW5ndWxhckNvcmVGaWxlID0gISFvcmlnaW5hbEZpbGVQYXRoICYmIGlzS25vd25Db3JlRmlsZShvcmlnaW5hbEZpbGVQYXRoKTtcbiAgfVxuXG4gIGNvbnN0IGhhc1NhZmVTaWRlRWZmZWN0cyA9IG9yaWdpbmFsRmlsZVBhdGggJiYgaXNLbm93blNpZGVFZmZlY3RGcmVlKG9yaWdpbmFsRmlsZVBhdGgpO1xuXG4gIC8vIERldGVybWluZSB3aGljaCB0cmFuc2Zvcm1zIHRvIGFwcGx5LlxuICBjb25zdCBnZXRUcmFuc2Zvcm1zOiBUcmFuc2Zvcm1lckZhY3RvcnlDcmVhdG9yW10gPSBbXTtcblxuICBsZXQgdHlwZUNoZWNrID0gZmFsc2U7XG4gIGlmIChoYXNTYWZlU2lkZUVmZmVjdHMpIHtcbiAgICAvLyBBbmd1bGFyIG1vZHVsZXMgaGF2ZSBrbm93biBzYWZlIHNpZGUgZWZmZWN0c1xuICAgIGdldFRyYW5zZm9ybXMucHVzaChcbiAgICAgIC8vIGdldFByZWZpeEZ1bmN0aW9uc1RyYW5zZm9ybWVyIGlzIHJhdGhlciBkYW5nZXJvdXMsIGFwcGx5IG9ubHkgdG8ga25vd24gcHVyZSBlczUgbW9kdWxlcy5cbiAgICAgIC8vIEl0IHdpbGwgbWFyayBib3RoIGByZXF1aXJlKClgIGNhbGxzIGFuZCBgY29uc29sZS5sb2coc3R1ZmYpYCBhcyBwdXJlLlxuICAgICAgLy8gV2Ugb25seSBhcHBseSBpdCB0byBtb2R1bGVzIGtub3duIHRvIGJlIHNpZGUgZWZmZWN0IGZyZWUsIHNpbmNlIHdlIGtub3cgdGhleSBhcmUgc2FmZS5cbiAgICAgIGdldFByZWZpeEZ1bmN0aW9uc1RyYW5zZm9ybWVyLFxuICAgICk7XG4gICAgdHlwZUNoZWNrID0gdHJ1ZTtcbiAgfSBlbHNlIGlmICh0ZXN0UHJlZml4Q2xhc3Nlcyhjb250ZW50KSkge1xuICAgIC8vIFRoaXMgaXMgb25seSByZWxldmFudCBpZiBwcmVmaXggZnVuY3Rpb25zIGlzIG5vdCB1c2VkIHNpbmNlIHByZWZpeCBmdW5jdGlvbnMgd2lsbCBwcmVmaXggSUlGRSB3cmFwcGVkIGNsYXNzZXMuXG4gICAgZ2V0VHJhbnNmb3Jtcy51bnNoaWZ0KGdldFByZWZpeENsYXNzZXNUcmFuc2Zvcm1lcik7XG4gIH1cblxuICBpZiAodGVzdFNjcnViRmlsZShjb250ZW50KSkge1xuICAgIC8vIEFsd2F5cyB0ZXN0IGFzIHRoZXNlIHJlcXVpcmUgdGhlIHR5cGUgY2hlY2tlclxuICAgIGdldFRyYW5zZm9ybXMucHVzaChjcmVhdGVTY3J1YkZpbGVUcmFuc2Zvcm1lckZhY3RvcnkoaXNBbmd1bGFyQ29yZUZpbGUpKTtcbiAgICB0eXBlQ2hlY2sgPSB0cnVlO1xuICB9XG5cbiAgZ2V0VHJhbnNmb3Jtcy5wdXNoKGdldFdyYXBFbnVtc1RyYW5zZm9ybWVyKTtcblxuICBjb25zdCB0cmFuc2Zvcm1KYXZhc2NyaXB0T3B0czogVHJhbnNmb3JtSmF2YXNjcmlwdE9wdGlvbnMgPSB7XG4gICAgY29udGVudDogY29udGVudCxcbiAgICBpbnB1dEZpbGVQYXRoOiBvcHRpb25zLmlucHV0RmlsZVBhdGgsXG4gICAgb3V0cHV0RmlsZVBhdGg6IG9wdGlvbnMub3V0cHV0RmlsZVBhdGgsXG4gICAgZW1pdFNvdXJjZU1hcDogb3B0aW9ucy5lbWl0U291cmNlTWFwLFxuICAgIHN0cmljdDogb3B0aW9ucy5zdHJpY3QsXG4gICAgZ2V0VHJhbnNmb3JtcyxcbiAgICB0eXBlQ2hlY2ssXG4gIH07XG5cbiAgcmV0dXJuIHRyYW5zZm9ybUphdmFzY3JpcHQodHJhbnNmb3JtSmF2YXNjcmlwdE9wdHMpO1xufVxuIl19