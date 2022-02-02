"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildOptimizerLoaderPath = void 0;
const webpack_1 = require("webpack");
const build_optimizer_1 = require("./build-optimizer");
exports.buildOptimizerLoaderPath = __filename;
const alwaysProcess = (path) => path.endsWith('.ts') || path.endsWith('.tsx');
function buildOptimizerLoader(content, previousSourceMap) {
    this.cacheable();
    const skipBuildOptimizer = this._module && this._module.factoryMeta && this._module.factoryMeta.skipBuildOptimizer;
    if (!alwaysProcess(this.resourcePath) && skipBuildOptimizer) {
        // Skip loading processing this file with Build Optimizer if we determined in
        // BuildOptimizerWebpackPlugin that we shouldn't.
        this.callback(null, content, previousSourceMap);
        return;
    }
    const options = (this.getOptions() || {});
    const boOutput = (0, build_optimizer_1.buildOptimizer)({
        content,
        originalFilePath: this.resourcePath,
        inputFilePath: this.resourcePath,
        outputFilePath: this.resourcePath,
        emitSourceMap: options.sourceMap,
        isSideEffectFree: this._module && this._module.factoryMeta && this._module.factoryMeta.sideEffectFree,
    });
    if (boOutput.emitSkipped || boOutput.content === null) {
        this.callback(null, content, previousSourceMap);
        return;
    }
    const intermediateSourceMap = boOutput.sourceMap;
    let newContent = boOutput.content;
    let newSourceMap;
    if (options.sourceMap && intermediateSourceMap) {
        // Webpack doesn't need sourceMappingURL since we pass them on explicitely.
        newContent = newContent.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, '');
        if (previousSourceMap) {
            // Use http://sokra.github.io/source-map-visualization/ to validate sourcemaps make sense.
            newSourceMap = new webpack_1.sources.SourceMapSource(newContent, this.resourcePath, intermediateSourceMap, content, previousSourceMap, true).map();
        }
        else {
            // Otherwise just return our generated sourcemap.
            newSourceMap = intermediateSourceMap;
        }
    }
    this.callback(null, newContent, newSourceMap);
}
exports.default = buildOptimizerLoader;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2VicGFjay1sb2FkZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyX2RldmtpdC9idWlsZF9vcHRpbWl6ZXIvc3JjL2J1aWxkLW9wdGltaXplci93ZWJwYWNrLWxvYWRlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7QUFHSCxxQ0FBa0M7QUFDbEMsdURBQW1EO0FBTXRDLFFBQUEsd0JBQXdCLEdBQUcsVUFBVSxDQUFDO0FBRW5ELE1BQU0sYUFBYSxHQUFHLENBQUMsSUFBWSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7QUFFdEYsU0FBd0Isb0JBQW9CLENBUzFDLE9BQWUsRUFDZixpQkFBK0I7SUFFL0IsSUFBSSxDQUFDLFNBQVMsRUFBRSxDQUFDO0lBRWpCLE1BQU0sa0JBQWtCLEdBQ3RCLElBQUksQ0FBQyxPQUFPLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLElBQUksSUFBSSxDQUFDLE9BQU8sQ0FBQyxXQUFXLENBQUMsa0JBQWtCLENBQUM7SUFFMUYsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLElBQUksa0JBQWtCLEVBQUU7UUFDM0QsNkVBQTZFO1FBQzdFLGlEQUFpRDtRQUNqRCxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxPQUFPLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztRQUVoRCxPQUFPO0tBQ1I7SUFFRCxNQUFNLE9BQU8sR0FBRyxDQUFDLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxFQUFFLENBQWdDLENBQUM7SUFFekUsTUFBTSxRQUFRLEdBQUcsSUFBQSxnQ0FBYyxFQUFDO1FBQzlCLE9BQU87UUFDUCxnQkFBZ0IsRUFBRSxJQUFJLENBQUMsWUFBWTtRQUNuQyxhQUFhLEVBQUUsSUFBSSxDQUFDLFlBQVk7UUFDaEMsY0FBYyxFQUFFLElBQUksQ0FBQyxZQUFZO1FBQ2pDLGFBQWEsRUFBRSxPQUFPLENBQUMsU0FBUztRQUNoQyxnQkFBZ0IsRUFDZCxJQUFJLENBQUMsT0FBTyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLGNBQWM7S0FDdEYsQ0FBQyxDQUFDO0lBRUgsSUFBSSxRQUFRLENBQUMsV0FBVyxJQUFJLFFBQVEsQ0FBQyxPQUFPLEtBQUssSUFBSSxFQUFFO1FBQ3JELElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLE9BQU8sRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1FBRWhELE9BQU87S0FDUjtJQUVELE1BQU0scUJBQXFCLEdBQUcsUUFBUSxDQUFDLFNBQVMsQ0FBQztJQUNqRCxJQUFJLFVBQVUsR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDO0lBRWxDLElBQUksWUFBWSxDQUFDO0lBRWpCLElBQUksT0FBTyxDQUFDLFNBQVMsSUFBSSxxQkFBcUIsRUFBRTtRQUM5QywyRUFBMkU7UUFDM0UsVUFBVSxHQUFHLFVBQVUsQ0FBQyxPQUFPLENBQUMsb0NBQW9DLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFMUUsSUFBSSxpQkFBaUIsRUFBRTtZQUNyQiwwRkFBMEY7WUFDMUYsWUFBWSxHQUFHLElBQUksaUJBQU8sQ0FBQyxlQUFlLENBQ3hDLFVBQVUsRUFDVixJQUFJLENBQUMsWUFBWSxFQUNqQixxQkFBcUIsRUFDckIsT0FBTyxFQUNQLGlCQUFpQixFQUNqQixJQUFJLENBQ0wsQ0FBQyxHQUFHLEVBQUUsQ0FBQztTQUNUO2FBQU07WUFDTCxpREFBaUQ7WUFDakQsWUFBWSxHQUFHLHFCQUFxQixDQUFDO1NBQ3RDO0tBQ0Y7SUFFRCxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUUsWUFBWSxDQUFDLENBQUM7QUFDaEQsQ0FBQztBQXJFRCx1Q0FxRUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0IHsgUmF3U291cmNlTWFwIH0gZnJvbSAnc291cmNlLW1hcCc7XG5pbXBvcnQgeyBzb3VyY2VzIH0gZnJvbSAnd2VicGFjayc7XG5pbXBvcnQgeyBidWlsZE9wdGltaXplciB9IGZyb20gJy4vYnVpbGQtb3B0aW1pemVyJztcblxuaW50ZXJmYWNlIEJ1aWxkT3B0aW1pemVyTG9hZGVyT3B0aW9ucyB7XG4gIHNvdXJjZU1hcDogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNvbnN0IGJ1aWxkT3B0aW1pemVyTG9hZGVyUGF0aCA9IF9fZmlsZW5hbWU7XG5cbmNvbnN0IGFsd2F5c1Byb2Nlc3MgPSAocGF0aDogc3RyaW5nKSA9PiBwYXRoLmVuZHNXaXRoKCcudHMnKSB8fCBwYXRoLmVuZHNXaXRoKCcudHN4Jyk7XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIGJ1aWxkT3B0aW1pemVyTG9hZGVyKFxuICAvLyBXZWJwYWNrIDUgZG9lcyBub3QgcHJvdmlkZSBhIExvYWRlckNvbnRleHQgdHlwZVxuICB0aGlzOiB7XG4gICAgcmVzb3VyY2VQYXRoOiBzdHJpbmc7XG4gICAgX21vZHVsZTogeyBmYWN0b3J5TWV0YTogeyBza2lwQnVpbGRPcHRpbWl6ZXI/OiBib29sZWFuOyBzaWRlRWZmZWN0RnJlZT86IGJvb2xlYW4gfSB9O1xuICAgIGNhY2hlYWJsZSgpOiB2b2lkO1xuICAgIGNhbGxiYWNrKGVycm9yPzogRXJyb3IgfCBudWxsLCBjb250ZW50Pzogc3RyaW5nLCBzb3VyY2VNYXA/OiB1bmtub3duKTogdm9pZDtcbiAgICBnZXRPcHRpb25zKCk6IHVua25vd247XG4gIH0sXG4gIGNvbnRlbnQ6IHN0cmluZyxcbiAgcHJldmlvdXNTb3VyY2VNYXA6IFJhd1NvdXJjZU1hcCxcbikge1xuICB0aGlzLmNhY2hlYWJsZSgpO1xuXG4gIGNvbnN0IHNraXBCdWlsZE9wdGltaXplciA9XG4gICAgdGhpcy5fbW9kdWxlICYmIHRoaXMuX21vZHVsZS5mYWN0b3J5TWV0YSAmJiB0aGlzLl9tb2R1bGUuZmFjdG9yeU1ldGEuc2tpcEJ1aWxkT3B0aW1pemVyO1xuXG4gIGlmICghYWx3YXlzUHJvY2Vzcyh0aGlzLnJlc291cmNlUGF0aCkgJiYgc2tpcEJ1aWxkT3B0aW1pemVyKSB7XG4gICAgLy8gU2tpcCBsb2FkaW5nIHByb2Nlc3NpbmcgdGhpcyBmaWxlIHdpdGggQnVpbGQgT3B0aW1pemVyIGlmIHdlIGRldGVybWluZWQgaW5cbiAgICAvLyBCdWlsZE9wdGltaXplcldlYnBhY2tQbHVnaW4gdGhhdCB3ZSBzaG91bGRuJ3QuXG4gICAgdGhpcy5jYWxsYmFjayhudWxsLCBjb250ZW50LCBwcmV2aW91c1NvdXJjZU1hcCk7XG5cbiAgICByZXR1cm47XG4gIH1cblxuICBjb25zdCBvcHRpb25zID0gKHRoaXMuZ2V0T3B0aW9ucygpIHx8IHt9KSBhcyBCdWlsZE9wdGltaXplckxvYWRlck9wdGlvbnM7XG5cbiAgY29uc3QgYm9PdXRwdXQgPSBidWlsZE9wdGltaXplcih7XG4gICAgY29udGVudCxcbiAgICBvcmlnaW5hbEZpbGVQYXRoOiB0aGlzLnJlc291cmNlUGF0aCxcbiAgICBpbnB1dEZpbGVQYXRoOiB0aGlzLnJlc291cmNlUGF0aCxcbiAgICBvdXRwdXRGaWxlUGF0aDogdGhpcy5yZXNvdXJjZVBhdGgsXG4gICAgZW1pdFNvdXJjZU1hcDogb3B0aW9ucy5zb3VyY2VNYXAsXG4gICAgaXNTaWRlRWZmZWN0RnJlZTpcbiAgICAgIHRoaXMuX21vZHVsZSAmJiB0aGlzLl9tb2R1bGUuZmFjdG9yeU1ldGEgJiYgdGhpcy5fbW9kdWxlLmZhY3RvcnlNZXRhLnNpZGVFZmZlY3RGcmVlLFxuICB9KTtcblxuICBpZiAoYm9PdXRwdXQuZW1pdFNraXBwZWQgfHwgYm9PdXRwdXQuY29udGVudCA9PT0gbnVsbCkge1xuICAgIHRoaXMuY2FsbGJhY2sobnVsbCwgY29udGVudCwgcHJldmlvdXNTb3VyY2VNYXApO1xuXG4gICAgcmV0dXJuO1xuICB9XG5cbiAgY29uc3QgaW50ZXJtZWRpYXRlU291cmNlTWFwID0gYm9PdXRwdXQuc291cmNlTWFwO1xuICBsZXQgbmV3Q29udGVudCA9IGJvT3V0cHV0LmNvbnRlbnQ7XG5cbiAgbGV0IG5ld1NvdXJjZU1hcDtcblxuICBpZiAob3B0aW9ucy5zb3VyY2VNYXAgJiYgaW50ZXJtZWRpYXRlU291cmNlTWFwKSB7XG4gICAgLy8gV2VicGFjayBkb2Vzbid0IG5lZWQgc291cmNlTWFwcGluZ1VSTCBzaW5jZSB3ZSBwYXNzIHRoZW0gb24gZXhwbGljaXRlbHkuXG4gICAgbmV3Q29udGVudCA9IG5ld0NvbnRlbnQucmVwbGFjZSgvXlxcL1xcLyMgc291cmNlTWFwcGluZ1VSTD1bXlxcclxcbl0qL2dtLCAnJyk7XG5cbiAgICBpZiAocHJldmlvdXNTb3VyY2VNYXApIHtcbiAgICAgIC8vIFVzZSBodHRwOi8vc29rcmEuZ2l0aHViLmlvL3NvdXJjZS1tYXAtdmlzdWFsaXphdGlvbi8gdG8gdmFsaWRhdGUgc291cmNlbWFwcyBtYWtlIHNlbnNlLlxuICAgICAgbmV3U291cmNlTWFwID0gbmV3IHNvdXJjZXMuU291cmNlTWFwU291cmNlKFxuICAgICAgICBuZXdDb250ZW50LFxuICAgICAgICB0aGlzLnJlc291cmNlUGF0aCxcbiAgICAgICAgaW50ZXJtZWRpYXRlU291cmNlTWFwLFxuICAgICAgICBjb250ZW50LFxuICAgICAgICBwcmV2aW91c1NvdXJjZU1hcCxcbiAgICAgICAgdHJ1ZSxcbiAgICAgICkubWFwKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIE90aGVyd2lzZSBqdXN0IHJldHVybiBvdXIgZ2VuZXJhdGVkIHNvdXJjZW1hcC5cbiAgICAgIG5ld1NvdXJjZU1hcCA9IGludGVybWVkaWF0ZVNvdXJjZU1hcDtcbiAgICB9XG4gIH1cblxuICB0aGlzLmNhbGxiYWNrKG51bGwsIG5ld0NvbnRlbnQsIG5ld1NvdXJjZU1hcCk7XG59XG4iXX0=