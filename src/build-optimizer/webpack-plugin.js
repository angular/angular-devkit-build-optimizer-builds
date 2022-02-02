"use strict";
/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BuildOptimizerWebpackPlugin = void 0;
class BuildOptimizerWebpackPlugin {
    apply(compiler) {
        compiler.hooks.normalModuleFactory.tap('BuildOptimizerWebpackPlugin', (nmf) => {
            nmf.hooks.module.tap('BuildOptimizerWebpackPlugin', (module, data) => {
                var _a;
                if ((_a = data.resourceResolveData) === null || _a === void 0 ? void 0 : _a.descriptionFileData) {
                    // Only TS packages should use Build Optimizer.
                    // Notes:
                    // - a TS package might not have defined typings but still use .d.ts files next to their
                    // .js files. We don't cover that case because the Angular Package Format (APF) calls for
                    // using the Typings field and Build Optimizer is geared towards APF. Maybe we could
                    // provide configuration options to the plugin to cover that case if there's demand.
                    // - a JS-only package that also happens to provides typings will also be flagged by this
                    // check. Not sure there's a good way to skip those.
                    const skipBuildOptimizer = !data.resourceResolveData.descriptionFileData.typings;
                    module.factoryMeta = { ...module.factoryMeta, skipBuildOptimizer };
                }
                return module;
            });
        });
    }
}
exports.BuildOptimizerWebpackPlugin = BuildOptimizerWebpackPlugin;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2VicGFjay1wbHVnaW4uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyX2RldmtpdC9idWlsZF9vcHRpbWl6ZXIvc3JjL2J1aWxkLW9wdGltaXplci93ZWJwYWNrLXBsdWdpbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7QUFRSCxNQUFhLDJCQUEyQjtJQUN0QyxLQUFLLENBQUMsUUFBa0I7UUFDdEIsUUFBUSxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxHQUFHLENBQUMsNkJBQTZCLEVBQUUsQ0FBQyxHQUFHLEVBQUUsRUFBRTtZQUM1RSxHQUFHLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsNkJBQTZCLEVBQUUsQ0FBQyxNQUFjLEVBQUUsSUFBZ0IsRUFBRSxFQUFFOztnQkFDdkYsSUFBSSxNQUFBLElBQUksQ0FBQyxtQkFBbUIsMENBQUUsbUJBQW1CLEVBQUU7b0JBQ2pELCtDQUErQztvQkFDL0MsU0FBUztvQkFDVCx3RkFBd0Y7b0JBQ3hGLHlGQUF5RjtvQkFDekYsb0ZBQW9GO29CQUNwRixvRkFBb0Y7b0JBQ3BGLHlGQUF5RjtvQkFDekYsb0RBQW9EO29CQUNwRCxNQUFNLGtCQUFrQixHQUFHLENBQUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLG1CQUFtQixDQUFDLE9BQU8sQ0FBQztvQkFDakYsTUFBTSxDQUFDLFdBQVcsR0FBRyxFQUFFLEdBQUcsTUFBTSxDQUFDLFdBQVcsRUFBRSxrQkFBa0IsRUFBRSxDQUFDO2lCQUNwRTtnQkFFRCxPQUFPLE1BQU0sQ0FBQztZQUNoQixDQUFDLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBckJELGtFQXFCQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgdHlwZSB7IENvbXBpbGVyLCBNb2R1bGUgfSBmcm9tICd3ZWJwYWNrJztcblxuaW50ZXJmYWNlIE1vZHVsZURhdGEge1xuICByZXNvdXJjZVJlc29sdmVEYXRhPzogeyBkZXNjcmlwdGlvbkZpbGVEYXRhPzogeyB0eXBpbmdzPzogc3RyaW5nIH0gfTtcbn1cblxuZXhwb3J0IGNsYXNzIEJ1aWxkT3B0aW1pemVyV2VicGFja1BsdWdpbiB7XG4gIGFwcGx5KGNvbXBpbGVyOiBDb21waWxlcikge1xuICAgIGNvbXBpbGVyLmhvb2tzLm5vcm1hbE1vZHVsZUZhY3RvcnkudGFwKCdCdWlsZE9wdGltaXplcldlYnBhY2tQbHVnaW4nLCAobm1mKSA9PiB7XG4gICAgICBubWYuaG9va3MubW9kdWxlLnRhcCgnQnVpbGRPcHRpbWl6ZXJXZWJwYWNrUGx1Z2luJywgKG1vZHVsZTogTW9kdWxlLCBkYXRhOiBNb2R1bGVEYXRhKSA9PiB7XG4gICAgICAgIGlmIChkYXRhLnJlc291cmNlUmVzb2x2ZURhdGE/LmRlc2NyaXB0aW9uRmlsZURhdGEpIHtcbiAgICAgICAgICAvLyBPbmx5IFRTIHBhY2thZ2VzIHNob3VsZCB1c2UgQnVpbGQgT3B0aW1pemVyLlxuICAgICAgICAgIC8vIE5vdGVzOlxuICAgICAgICAgIC8vIC0gYSBUUyBwYWNrYWdlIG1pZ2h0IG5vdCBoYXZlIGRlZmluZWQgdHlwaW5ncyBidXQgc3RpbGwgdXNlIC5kLnRzIGZpbGVzIG5leHQgdG8gdGhlaXJcbiAgICAgICAgICAvLyAuanMgZmlsZXMuIFdlIGRvbid0IGNvdmVyIHRoYXQgY2FzZSBiZWNhdXNlIHRoZSBBbmd1bGFyIFBhY2thZ2UgRm9ybWF0IChBUEYpIGNhbGxzIGZvclxuICAgICAgICAgIC8vIHVzaW5nIHRoZSBUeXBpbmdzIGZpZWxkIGFuZCBCdWlsZCBPcHRpbWl6ZXIgaXMgZ2VhcmVkIHRvd2FyZHMgQVBGLiBNYXliZSB3ZSBjb3VsZFxuICAgICAgICAgIC8vIHByb3ZpZGUgY29uZmlndXJhdGlvbiBvcHRpb25zIHRvIHRoZSBwbHVnaW4gdG8gY292ZXIgdGhhdCBjYXNlIGlmIHRoZXJlJ3MgZGVtYW5kLlxuICAgICAgICAgIC8vIC0gYSBKUy1vbmx5IHBhY2thZ2UgdGhhdCBhbHNvIGhhcHBlbnMgdG8gcHJvdmlkZXMgdHlwaW5ncyB3aWxsIGFsc28gYmUgZmxhZ2dlZCBieSB0aGlzXG4gICAgICAgICAgLy8gY2hlY2suIE5vdCBzdXJlIHRoZXJlJ3MgYSBnb29kIHdheSB0byBza2lwIHRob3NlLlxuICAgICAgICAgIGNvbnN0IHNraXBCdWlsZE9wdGltaXplciA9ICFkYXRhLnJlc291cmNlUmVzb2x2ZURhdGEuZGVzY3JpcHRpb25GaWxlRGF0YS50eXBpbmdzO1xuICAgICAgICAgIG1vZHVsZS5mYWN0b3J5TWV0YSA9IHsgLi4ubW9kdWxlLmZhY3RvcnlNZXRhLCBza2lwQnVpbGRPcHRpbWl6ZXIgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBtb2R1bGU7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxufVxuIl19