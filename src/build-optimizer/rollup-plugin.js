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
/**
 * @fileoverview This adapts the buildOptimizer to run over each file as it is
 * processed by Rollup. We must do this since buildOptimizer expects to see the
 * ESModules in the input sources, and therefore cannot run on the rollup output
 */
const path = __importStar(require("path"));
const build_optimizer_1 = require("./build-optimizer");
const DEBUG = false;
function optimizer(options) {
    // Normalize paths for comparison.
    if (options.sideEffectFreeModules) {
        options.sideEffectFreeModules = options.sideEffectFreeModules.map((p) => p.replace(/\\/g, '/'));
    }
    return {
        name: 'build-optimizer',
        transform: (content, id) => {
            const normalizedId = id.replace(/\\/g, '/');
            const isSideEffectFree = options.sideEffectFreeModules &&
                options.sideEffectFreeModules.some((m) => normalizedId.indexOf(m) >= 0);
            const isAngularCoreFile = options.angularCoreModules &&
                options.angularCoreModules.some((m) => normalizedId.indexOf(m) >= 0);
            const { content: code, sourceMap: map } = (0, build_optimizer_1.buildOptimizer)({
                content,
                inputFilePath: id,
                emitSourceMap: true,
                isSideEffectFree,
                isAngularCoreFile,
            });
            if (!code) {
                if (DEBUG) {
                    // eslint-disable-next-line no-console
                    console.error('no transforms produced by buildOptimizer for ' + path.relative(process.cwd(), id));
                }
                return null;
            }
            if (!map) {
                throw new Error('no sourcemap produced by buildOptimizer');
            }
            return { code, map };
        },
    };
}
exports.default = optimizer;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm9sbHVwLXBsdWdpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2J1aWxkX29wdGltaXplci9zcmMvYnVpbGQtb3B0aW1pemVyL3JvbGx1cC1wbHVnaW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUg7Ozs7R0FJRztBQUVILDJDQUE2QjtBQUU3Qix1REFBbUQ7QUFFbkQsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDO0FBT3BCLFNBQXdCLFNBQVMsQ0FBQyxPQUFnQjtJQUNoRCxrQ0FBa0M7SUFDbEMsSUFBSSxPQUFPLENBQUMscUJBQXFCLEVBQUU7UUFDakMsT0FBTyxDQUFDLHFCQUFxQixHQUFHLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7S0FDakc7SUFFRCxPQUFPO1FBQ0wsSUFBSSxFQUFFLGlCQUFpQjtRQUN2QixTQUFTLEVBQUUsQ0FBQyxPQUFlLEVBQUUsRUFBVSxFQUE4QyxFQUFFO1lBQ3JGLE1BQU0sWUFBWSxHQUFHLEVBQUUsQ0FBQyxPQUFPLENBQUMsS0FBSyxFQUFFLEdBQUcsQ0FBQyxDQUFDO1lBQzVDLE1BQU0sZ0JBQWdCLEdBQ3BCLE9BQU8sQ0FBQyxxQkFBcUI7Z0JBQzdCLE9BQU8sQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDMUUsTUFBTSxpQkFBaUIsR0FDckIsT0FBTyxDQUFDLGtCQUFrQjtnQkFDMUIsT0FBTyxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsWUFBWSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztZQUN2RSxNQUFNLEVBQUUsT0FBTyxFQUFFLElBQUksRUFBRSxTQUFTLEVBQUUsR0FBRyxFQUFFLEdBQUcsSUFBQSxnQ0FBYyxFQUFDO2dCQUN2RCxPQUFPO2dCQUNQLGFBQWEsRUFBRSxFQUFFO2dCQUNqQixhQUFhLEVBQUUsSUFBSTtnQkFDbkIsZ0JBQWdCO2dCQUNoQixpQkFBaUI7YUFDbEIsQ0FBQyxDQUFDO1lBQ0gsSUFBSSxDQUFDLElBQUksRUFBRTtnQkFDVCxJQUFJLEtBQUssRUFBRTtvQkFDVCxzQ0FBc0M7b0JBQ3RDLE9BQU8sQ0FBQyxLQUFLLENBQ1gsK0NBQStDLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLEVBQUUsRUFBRSxDQUFDLENBQ25GLENBQUM7aUJBQ0g7Z0JBRUQsT0FBTyxJQUFJLENBQUM7YUFDYjtZQUNELElBQUksQ0FBQyxHQUFHLEVBQUU7Z0JBQ1IsTUFBTSxJQUFJLEtBQUssQ0FBQyx5Q0FBeUMsQ0FBQyxDQUFDO2FBQzVEO1lBRUQsT0FBTyxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQztRQUN2QixDQUFDO0tBQ0YsQ0FBQztBQUNKLENBQUM7QUF4Q0QsNEJBd0NDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbi8qKlxuICogQGZpbGVvdmVydmlldyBUaGlzIGFkYXB0cyB0aGUgYnVpbGRPcHRpbWl6ZXIgdG8gcnVuIG92ZXIgZWFjaCBmaWxlIGFzIGl0IGlzXG4gKiBwcm9jZXNzZWQgYnkgUm9sbHVwLiBXZSBtdXN0IGRvIHRoaXMgc2luY2UgYnVpbGRPcHRpbWl6ZXIgZXhwZWN0cyB0byBzZWUgdGhlXG4gKiBFU01vZHVsZXMgaW4gdGhlIGlucHV0IHNvdXJjZXMsIGFuZCB0aGVyZWZvcmUgY2Fubm90IHJ1biBvbiB0aGUgcm9sbHVwIG91dHB1dFxuICovXG5cbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5pbXBvcnQgeyBSYXdTb3VyY2VNYXAgfSBmcm9tICdzb3VyY2UtbWFwJztcbmltcG9ydCB7IGJ1aWxkT3B0aW1pemVyIH0gZnJvbSAnLi9idWlsZC1vcHRpbWl6ZXInO1xuXG5jb25zdCBERUJVRyA9IGZhbHNlO1xuXG5leHBvcnQgaW50ZXJmYWNlIE9wdGlvbnMge1xuICBzaWRlRWZmZWN0RnJlZU1vZHVsZXM/OiBzdHJpbmdbXTtcbiAgYW5ndWxhckNvcmVNb2R1bGVzPzogc3RyaW5nW107XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIG9wdGltaXplcihvcHRpb25zOiBPcHRpb25zKSB7XG4gIC8vIE5vcm1hbGl6ZSBwYXRocyBmb3IgY29tcGFyaXNvbi5cbiAgaWYgKG9wdGlvbnMuc2lkZUVmZmVjdEZyZWVNb2R1bGVzKSB7XG4gICAgb3B0aW9ucy5zaWRlRWZmZWN0RnJlZU1vZHVsZXMgPSBvcHRpb25zLnNpZGVFZmZlY3RGcmVlTW9kdWxlcy5tYXAoKHApID0+IHAucmVwbGFjZSgvXFxcXC9nLCAnLycpKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgbmFtZTogJ2J1aWxkLW9wdGltaXplcicsXG4gICAgdHJhbnNmb3JtOiAoY29udGVudDogc3RyaW5nLCBpZDogc3RyaW5nKTogeyBjb2RlOiBzdHJpbmc7IG1hcDogUmF3U291cmNlTWFwIH0gfCBudWxsID0+IHtcbiAgICAgIGNvbnN0IG5vcm1hbGl6ZWRJZCA9IGlkLnJlcGxhY2UoL1xcXFwvZywgJy8nKTtcbiAgICAgIGNvbnN0IGlzU2lkZUVmZmVjdEZyZWUgPVxuICAgICAgICBvcHRpb25zLnNpZGVFZmZlY3RGcmVlTW9kdWxlcyAmJlxuICAgICAgICBvcHRpb25zLnNpZGVFZmZlY3RGcmVlTW9kdWxlcy5zb21lKChtKSA9PiBub3JtYWxpemVkSWQuaW5kZXhPZihtKSA+PSAwKTtcbiAgICAgIGNvbnN0IGlzQW5ndWxhckNvcmVGaWxlID1cbiAgICAgICAgb3B0aW9ucy5hbmd1bGFyQ29yZU1vZHVsZXMgJiZcbiAgICAgICAgb3B0aW9ucy5hbmd1bGFyQ29yZU1vZHVsZXMuc29tZSgobSkgPT4gbm9ybWFsaXplZElkLmluZGV4T2YobSkgPj0gMCk7XG4gICAgICBjb25zdCB7IGNvbnRlbnQ6IGNvZGUsIHNvdXJjZU1hcDogbWFwIH0gPSBidWlsZE9wdGltaXplcih7XG4gICAgICAgIGNvbnRlbnQsXG4gICAgICAgIGlucHV0RmlsZVBhdGg6IGlkLFxuICAgICAgICBlbWl0U291cmNlTWFwOiB0cnVlLFxuICAgICAgICBpc1NpZGVFZmZlY3RGcmVlLFxuICAgICAgICBpc0FuZ3VsYXJDb3JlRmlsZSxcbiAgICAgIH0pO1xuICAgICAgaWYgKCFjb2RlKSB7XG4gICAgICAgIGlmIChERUJVRykge1xuICAgICAgICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG4gICAgICAgICAgY29uc29sZS5lcnJvcihcbiAgICAgICAgICAgICdubyB0cmFuc2Zvcm1zIHByb2R1Y2VkIGJ5IGJ1aWxkT3B0aW1pemVyIGZvciAnICsgcGF0aC5yZWxhdGl2ZShwcm9jZXNzLmN3ZCgpLCBpZCksXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBudWxsO1xuICAgICAgfVxuICAgICAgaWYgKCFtYXApIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdubyBzb3VyY2VtYXAgcHJvZHVjZWQgYnkgYnVpbGRPcHRpbWl6ZXInKTtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIHsgY29kZSwgbWFwIH07XG4gICAgfSxcbiAgfTtcbn1cbiJdfQ==