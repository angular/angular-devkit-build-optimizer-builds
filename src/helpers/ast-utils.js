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
exports.getCleanHelperName = exports.isHelperName = exports.hasPureComment = exports.addPureComment = exports.collectDeepNodes = void 0;
const tslib = __importStar(require("tslib"));
const ts = __importStar(require("typescript"));
const pureFunctionComment = '@__PURE__';
// We include only exports that start with '__' because tslib helpers
// all start with a suffix of two underscores.
const tslibHelpers = new Set(Object.keys(tslib).filter((h) => h.startsWith('__')));
// Find all nodes from the AST in the subtree of node of SyntaxKind kind.
function collectDeepNodes(node, kind) {
    const nodes = [];
    const helper = (child) => {
        if (child.kind === kind) {
            nodes.push(child);
        }
        ts.forEachChild(child, helper);
    };
    ts.forEachChild(node, helper);
    return nodes;
}
exports.collectDeepNodes = collectDeepNodes;
function addPureComment(node) {
    return ts.addSyntheticLeadingComment(node, ts.SyntaxKind.MultiLineCommentTrivia, pureFunctionComment, false);
}
exports.addPureComment = addPureComment;
function hasPureComment(node) {
    if (!node) {
        return false;
    }
    const leadingComment = ts.getSyntheticLeadingComments(node);
    return !!leadingComment && leadingComment.some((comment) => comment.text === pureFunctionComment);
}
exports.hasPureComment = hasPureComment;
function isHelperName(name) {
    return tslibHelpers.has(name);
}
exports.isHelperName = isHelperName;
/**
 * In FESM's when not using `importHelpers` there might be multiple in the same file.
  @example
  ```
  var __decorate$1 = '';
  var __decorate$2 = '';
  ```
 * @returns Helper name without the '$' and number suffix or `undefined` if it's not a helper.
 */
function getCleanHelperName(name) {
    const parts = name.split('$');
    const cleanName = parts[0];
    if (parts.length > 2 || (parts.length === 2 && isNaN(+parts[1]))) {
        return undefined;
    }
    return isHelperName(cleanName) ? cleanName : undefined;
}
exports.getCleanHelperName = getCleanHelperName;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXN0LXV0aWxzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYnVpbGRfb3B0aW1pemVyL3NyYy9oZWxwZXJzL2FzdC11dGlscy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7Ozs7OztHQU1HOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsNkNBQStCO0FBQy9CLCtDQUFpQztBQUVqQyxNQUFNLG1CQUFtQixHQUFHLFdBQVcsQ0FBQztBQUV4QyxxRUFBcUU7QUFDckUsOENBQThDO0FBQzlDLE1BQU0sWUFBWSxHQUFHLElBQUksR0FBRyxDQUFTLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUUzRix5RUFBeUU7QUFDekUsU0FBZ0IsZ0JBQWdCLENBQW9CLElBQWEsRUFBRSxJQUFtQjtJQUNwRixNQUFNLEtBQUssR0FBUSxFQUFFLENBQUM7SUFDdEIsTUFBTSxNQUFNLEdBQUcsQ0FBQyxLQUFjLEVBQUUsRUFBRTtRQUNoQyxJQUFJLEtBQUssQ0FBQyxJQUFJLEtBQUssSUFBSSxFQUFFO1lBQ3ZCLEtBQUssQ0FBQyxJQUFJLENBQUMsS0FBVSxDQUFDLENBQUM7U0FDeEI7UUFDRCxFQUFFLENBQUMsWUFBWSxDQUFDLEtBQUssRUFBRSxNQUFNLENBQUMsQ0FBQztJQUNqQyxDQUFDLENBQUM7SUFDRixFQUFFLENBQUMsWUFBWSxDQUFDLElBQUksRUFBRSxNQUFNLENBQUMsQ0FBQztJQUU5QixPQUFPLEtBQUssQ0FBQztBQUNmLENBQUM7QUFYRCw0Q0FXQztBQUVELFNBQWdCLGNBQWMsQ0FBb0IsSUFBTztJQUN2RCxPQUFPLEVBQUUsQ0FBQywwQkFBMEIsQ0FDbEMsSUFBSSxFQUNKLEVBQUUsQ0FBQyxVQUFVLENBQUMsc0JBQXNCLEVBQ3BDLG1CQUFtQixFQUNuQixLQUFLLENBQ04sQ0FBQztBQUNKLENBQUM7QUFQRCx3Q0FPQztBQUVELFNBQWdCLGNBQWMsQ0FBQyxJQUFhO0lBQzFDLElBQUksQ0FBQyxJQUFJLEVBQUU7UUFDVCxPQUFPLEtBQUssQ0FBQztLQUNkO0lBRUQsTUFBTSxjQUFjLEdBQUcsRUFBRSxDQUFDLDJCQUEyQixDQUFDLElBQUksQ0FBQyxDQUFDO0lBRTVELE9BQU8sQ0FBQyxDQUFDLGNBQWMsSUFBSSxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxFQUFFLEVBQUUsQ0FBQyxPQUFPLENBQUMsSUFBSSxLQUFLLG1CQUFtQixDQUFDLENBQUM7QUFDcEcsQ0FBQztBQVJELHdDQVFDO0FBRUQsU0FBZ0IsWUFBWSxDQUFDLElBQVk7SUFDdkMsT0FBTyxZQUFZLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDO0FBQ2hDLENBQUM7QUFGRCxvQ0FFQztBQUVEOzs7Ozs7OztHQVFHO0FBQ0gsU0FBZ0Isa0JBQWtCLENBQUMsSUFBWTtJQUM3QyxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzlCLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUUzQixJQUFJLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE1BQU0sS0FBSyxDQUFDLElBQUksS0FBSyxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtRQUNoRSxPQUFPLFNBQVMsQ0FBQztLQUNsQjtJQUVELE9BQU8sWUFBWSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQztBQUN6RCxDQUFDO0FBVEQsZ0RBU0MiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0ICogYXMgdHNsaWIgZnJvbSAndHNsaWInO1xuaW1wb3J0ICogYXMgdHMgZnJvbSAndHlwZXNjcmlwdCc7XG5cbmNvbnN0IHB1cmVGdW5jdGlvbkNvbW1lbnQgPSAnQF9fUFVSRV9fJztcblxuLy8gV2UgaW5jbHVkZSBvbmx5IGV4cG9ydHMgdGhhdCBzdGFydCB3aXRoICdfXycgYmVjYXVzZSB0c2xpYiBoZWxwZXJzXG4vLyBhbGwgc3RhcnQgd2l0aCBhIHN1ZmZpeCBvZiB0d28gdW5kZXJzY29yZXMuXG5jb25zdCB0c2xpYkhlbHBlcnMgPSBuZXcgU2V0PHN0cmluZz4oT2JqZWN0LmtleXModHNsaWIpLmZpbHRlcigoaCkgPT4gaC5zdGFydHNXaXRoKCdfXycpKSk7XG5cbi8vIEZpbmQgYWxsIG5vZGVzIGZyb20gdGhlIEFTVCBpbiB0aGUgc3VidHJlZSBvZiBub2RlIG9mIFN5bnRheEtpbmQga2luZC5cbmV4cG9ydCBmdW5jdGlvbiBjb2xsZWN0RGVlcE5vZGVzPFQgZXh0ZW5kcyB0cy5Ob2RlPihub2RlOiB0cy5Ob2RlLCBraW5kOiB0cy5TeW50YXhLaW5kKTogVFtdIHtcbiAgY29uc3Qgbm9kZXM6IFRbXSA9IFtdO1xuICBjb25zdCBoZWxwZXIgPSAoY2hpbGQ6IHRzLk5vZGUpID0+IHtcbiAgICBpZiAoY2hpbGQua2luZCA9PT0ga2luZCkge1xuICAgICAgbm9kZXMucHVzaChjaGlsZCBhcyBUKTtcbiAgICB9XG4gICAgdHMuZm9yRWFjaENoaWxkKGNoaWxkLCBoZWxwZXIpO1xuICB9O1xuICB0cy5mb3JFYWNoQ2hpbGQobm9kZSwgaGVscGVyKTtcblxuICByZXR1cm4gbm9kZXM7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBhZGRQdXJlQ29tbWVudDxUIGV4dGVuZHMgdHMuTm9kZT4obm9kZTogVCk6IFQge1xuICByZXR1cm4gdHMuYWRkU3ludGhldGljTGVhZGluZ0NvbW1lbnQoXG4gICAgbm9kZSxcbiAgICB0cy5TeW50YXhLaW5kLk11bHRpTGluZUNvbW1lbnRUcml2aWEsXG4gICAgcHVyZUZ1bmN0aW9uQ29tbWVudCxcbiAgICBmYWxzZSxcbiAgKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGhhc1B1cmVDb21tZW50KG5vZGU6IHRzLk5vZGUpOiBib29sZWFuIHtcbiAgaWYgKCFub2RlKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgbGVhZGluZ0NvbW1lbnQgPSB0cy5nZXRTeW50aGV0aWNMZWFkaW5nQ29tbWVudHMobm9kZSk7XG5cbiAgcmV0dXJuICEhbGVhZGluZ0NvbW1lbnQgJiYgbGVhZGluZ0NvbW1lbnQuc29tZSgoY29tbWVudCkgPT4gY29tbWVudC50ZXh0ID09PSBwdXJlRnVuY3Rpb25Db21tZW50KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzSGVscGVyTmFtZShuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIHRzbGliSGVscGVycy5oYXMobmFtZSk7XG59XG5cbi8qKlxuICogSW4gRkVTTSdzIHdoZW4gbm90IHVzaW5nIGBpbXBvcnRIZWxwZXJzYCB0aGVyZSBtaWdodCBiZSBtdWx0aXBsZSBpbiB0aGUgc2FtZSBmaWxlLlxuICBAZXhhbXBsZVxuICBgYGBcbiAgdmFyIF9fZGVjb3JhdGUkMSA9ICcnO1xuICB2YXIgX19kZWNvcmF0ZSQyID0gJyc7XG4gIGBgYFxuICogQHJldHVybnMgSGVscGVyIG5hbWUgd2l0aG91dCB0aGUgJyQnIGFuZCBudW1iZXIgc3VmZml4IG9yIGB1bmRlZmluZWRgIGlmIGl0J3Mgbm90IGEgaGVscGVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q2xlYW5IZWxwZXJOYW1lKG5hbWU6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG4gIGNvbnN0IHBhcnRzID0gbmFtZS5zcGxpdCgnJCcpO1xuICBjb25zdCBjbGVhbk5hbWUgPSBwYXJ0c1swXTtcblxuICBpZiAocGFydHMubGVuZ3RoID4gMiB8fCAocGFydHMubGVuZ3RoID09PSAyICYmIGlzTmFOKCtwYXJ0c1sxXSkpKSB7XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuXG4gIHJldHVybiBpc0hlbHBlck5hbWUoY2xlYW5OYW1lKSA/IGNsZWFuTmFtZSA6IHVuZGVmaW5lZDtcbn1cbiJdfQ==