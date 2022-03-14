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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm9sbHVwLXBsdWdpbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2J1aWxkX29wdGltaXplci9zcmMvYnVpbGQtb3B0aW1pemVyL3JvbGx1cC1wbHVnaW4udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVIOzs7O0dBSUc7QUFFSCwyQ0FBNkI7QUFFN0IsdURBQW1EO0FBRW5ELE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQztBQU9wQixTQUF3QixTQUFTLENBQUMsT0FBZ0I7SUFDaEQsa0NBQWtDO0lBQ2xDLElBQUksT0FBTyxDQUFDLHFCQUFxQixFQUFFO1FBQ2pDLE9BQU8sQ0FBQyxxQkFBcUIsR0FBRyxPQUFPLENBQUMscUJBQXFCLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDO0tBQ2pHO0lBRUQsT0FBTztRQUNMLElBQUksRUFBRSxpQkFBaUI7UUFDdkIsU0FBUyxFQUFFLENBQUMsT0FBZSxFQUFFLEVBQVUsRUFBOEMsRUFBRTtZQUNyRixNQUFNLFlBQVksR0FBRyxFQUFFLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztZQUM1QyxNQUFNLGdCQUFnQixHQUNwQixPQUFPLENBQUMscUJBQXFCO2dCQUM3QixPQUFPLENBQUMscUJBQXFCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQzFFLE1BQU0saUJBQWlCLEdBQ3JCLE9BQU8sQ0FBQyxrQkFBa0I7Z0JBQzFCLE9BQU8sQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDdkUsTUFBTSxFQUFFLE9BQU8sRUFBRSxJQUFJLEVBQUUsU0FBUyxFQUFFLEdBQUcsRUFBRSxHQUFHLElBQUEsZ0NBQWMsRUFBQztnQkFDdkQsT0FBTztnQkFDUCxhQUFhLEVBQUUsRUFBRTtnQkFDakIsYUFBYSxFQUFFLElBQUk7Z0JBQ25CLGdCQUFnQjtnQkFDaEIsaUJBQWlCO2FBQ2xCLENBQUMsQ0FBQztZQUNILElBQUksQ0FBQyxJQUFJLEVBQUU7Z0JBQ1QsSUFBSSxLQUFLLEVBQUU7b0JBQ1Qsc0NBQXNDO29CQUN0QyxPQUFPLENBQUMsS0FBSyxDQUNYLCtDQUErQyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsRUFBRSxFQUFFLEVBQUUsQ0FBQyxDQUNuRixDQUFDO2lCQUNIO2dCQUVELE9BQU8sSUFBSSxDQUFDO2FBQ2I7WUFDRCxJQUFJLENBQUMsR0FBRyxFQUFFO2dCQUNSLE1BQU0sSUFBSSxLQUFLLENBQUMseUNBQXlDLENBQUMsQ0FBQzthQUM1RDtZQUVELE9BQU8sRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUM7UUFDdkIsQ0FBQztLQUNGLENBQUM7QUFDSixDQUFDO0FBeENELDRCQXdDQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG4vKipcbiAqIEBmaWxlb3ZlcnZpZXcgVGhpcyBhZGFwdHMgdGhlIGJ1aWxkT3B0aW1pemVyIHRvIHJ1biBvdmVyIGVhY2ggZmlsZSBhcyBpdCBpc1xuICogcHJvY2Vzc2VkIGJ5IFJvbGx1cC4gV2UgbXVzdCBkbyB0aGlzIHNpbmNlIGJ1aWxkT3B0aW1pemVyIGV4cGVjdHMgdG8gc2VlIHRoZVxuICogRVNNb2R1bGVzIGluIHRoZSBpbnB1dCBzb3VyY2VzLCBhbmQgdGhlcmVmb3JlIGNhbm5vdCBydW4gb24gdGhlIHJvbGx1cCBvdXRwdXRcbiAqL1xuXG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IHsgUmF3U291cmNlTWFwIH0gZnJvbSAnc291cmNlLW1hcCc7XG5pbXBvcnQgeyBidWlsZE9wdGltaXplciB9IGZyb20gJy4vYnVpbGQtb3B0aW1pemVyJztcblxuY29uc3QgREVCVUcgPSBmYWxzZTtcblxuZXhwb3J0IGludGVyZmFjZSBPcHRpb25zIHtcbiAgc2lkZUVmZmVjdEZyZWVNb2R1bGVzPzogc3RyaW5nW107XG4gIGFuZ3VsYXJDb3JlTW9kdWxlcz86IHN0cmluZ1tdO1xufVxuXG5leHBvcnQgZGVmYXVsdCBmdW5jdGlvbiBvcHRpbWl6ZXIob3B0aW9uczogT3B0aW9ucykge1xuICAvLyBOb3JtYWxpemUgcGF0aHMgZm9yIGNvbXBhcmlzb24uXG4gIGlmIChvcHRpb25zLnNpZGVFZmZlY3RGcmVlTW9kdWxlcykge1xuICAgIG9wdGlvbnMuc2lkZUVmZmVjdEZyZWVNb2R1bGVzID0gb3B0aW9ucy5zaWRlRWZmZWN0RnJlZU1vZHVsZXMubWFwKChwKSA9PiBwLnJlcGxhY2UoL1xcXFwvZywgJy8nKSk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIG5hbWU6ICdidWlsZC1vcHRpbWl6ZXInLFxuICAgIHRyYW5zZm9ybTogKGNvbnRlbnQ6IHN0cmluZywgaWQ6IHN0cmluZyk6IHsgY29kZTogc3RyaW5nOyBtYXA6IFJhd1NvdXJjZU1hcCB9IHwgbnVsbCA9PiB7XG4gICAgICBjb25zdCBub3JtYWxpemVkSWQgPSBpZC5yZXBsYWNlKC9cXFxcL2csICcvJyk7XG4gICAgICBjb25zdCBpc1NpZGVFZmZlY3RGcmVlID1cbiAgICAgICAgb3B0aW9ucy5zaWRlRWZmZWN0RnJlZU1vZHVsZXMgJiZcbiAgICAgICAgb3B0aW9ucy5zaWRlRWZmZWN0RnJlZU1vZHVsZXMuc29tZSgobSkgPT4gbm9ybWFsaXplZElkLmluZGV4T2YobSkgPj0gMCk7XG4gICAgICBjb25zdCBpc0FuZ3VsYXJDb3JlRmlsZSA9XG4gICAgICAgIG9wdGlvbnMuYW5ndWxhckNvcmVNb2R1bGVzICYmXG4gICAgICAgIG9wdGlvbnMuYW5ndWxhckNvcmVNb2R1bGVzLnNvbWUoKG0pID0+IG5vcm1hbGl6ZWRJZC5pbmRleE9mKG0pID49IDApO1xuICAgICAgY29uc3QgeyBjb250ZW50OiBjb2RlLCBzb3VyY2VNYXA6IG1hcCB9ID0gYnVpbGRPcHRpbWl6ZXIoe1xuICAgICAgICBjb250ZW50LFxuICAgICAgICBpbnB1dEZpbGVQYXRoOiBpZCxcbiAgICAgICAgZW1pdFNvdXJjZU1hcDogdHJ1ZSxcbiAgICAgICAgaXNTaWRlRWZmZWN0RnJlZSxcbiAgICAgICAgaXNBbmd1bGFyQ29yZUZpbGUsXG4gICAgICB9KTtcbiAgICAgIGlmICghY29kZSkge1xuICAgICAgICBpZiAoREVCVUcpIHtcbiAgICAgICAgICAvLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbm8tY29uc29sZVxuICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXG4gICAgICAgICAgICAnbm8gdHJhbnNmb3JtcyBwcm9kdWNlZCBieSBidWlsZE9wdGltaXplciBmb3IgJyArIHBhdGgucmVsYXRpdmUocHJvY2Vzcy5jd2QoKSwgaWQpLFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cbiAgICAgIGlmICghbWFwKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignbm8gc291cmNlbWFwIHByb2R1Y2VkIGJ5IGJ1aWxkT3B0aW1pemVyJyk7XG4gICAgICB9XG5cbiAgICAgIHJldHVybiB7IGNvZGUsIG1hcCB9O1xuICAgIH0sXG4gIH07XG59XG4iXX0=