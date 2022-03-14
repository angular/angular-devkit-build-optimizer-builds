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
exports.findTopLevelFunctions = exports.getPrefixFunctionsTransformer = void 0;
const ts = __importStar(require("typescript"));
const ast_utils_1 = require("../helpers/ast-utils");
function getPrefixFunctionsTransformer() {
    return (context) => {
        const transformer = (sf) => {
            const topLevelFunctions = findTopLevelFunctions(sf);
            const visitor = (node) => {
                // Add pure function comment to top level functions.
                if (topLevelFunctions.has(node)) {
                    const newNode = (0, ast_utils_1.addPureComment)(node);
                    // Replace node with modified one.
                    return ts.visitEachChild(newNode, visitor, context);
                }
                // Otherwise return node as is.
                return ts.visitEachChild(node, visitor, context);
            };
            return ts.visitNode(sf, visitor);
        };
        return transformer;
    };
}
exports.getPrefixFunctionsTransformer = getPrefixFunctionsTransformer;
function findTopLevelFunctions(parentNode) {
    const topLevelFunctions = new Set();
    function cb(node) {
        // Stop recursing into this branch if it's a definition construct.
        // These are function expression, function declaration, class, or arrow function (lambda).
        // The body of these constructs will not execute when loading the module, so we don't
        // need to mark function calls inside them as pure.
        // Class static initializers in ES2015 are an exception we don't cover. They would need similar
        // processing as enums to prevent property setting from causing the class to be retained.
        if (ts.isFunctionLike(node) ||
            ts.isClassLike(node) ||
            ts.isArrowFunction(node) ||
            ts.isMethodDeclaration(node)) {
            return;
        }
        let noPureComment = !(0, ast_utils_1.hasPureComment)(node);
        let innerNode = node;
        while (innerNode && ts.isParenthesizedExpression(innerNode)) {
            innerNode = innerNode.expression;
            noPureComment = noPureComment && !(0, ast_utils_1.hasPureComment)(innerNode);
        }
        if (!innerNode) {
            return;
        }
        if ((ts.isFunctionExpression(innerNode) || ts.isArrowFunction(innerNode)) &&
            ts.isParenthesizedExpression(node)) {
            // pure functions can be wrapped in parentizes
            // we should not add pure comments to this sort of syntax.
            // example var foo = (() => x)
            return;
        }
        if (noPureComment) {
            if (ts.isNewExpression(innerNode)) {
                topLevelFunctions.add(node);
            }
            else if (ts.isCallExpression(innerNode)) {
                let expression = innerNode.expression;
                if (ts.isIdentifier(expression) && (0, ast_utils_1.getCleanHelperName)(expression.text)) {
                    return;
                }
                while (expression && ts.isParenthesizedExpression(expression)) {
                    expression = expression.expression;
                }
                if (expression) {
                    if (ts.isFunctionExpression(expression)) {
                        // Skip IIFE's with arguments
                        // This could be improved to check if there are any references to variables
                        if (innerNode.arguments.length === 0) {
                            topLevelFunctions.add(node);
                        }
                    }
                    else {
                        topLevelFunctions.add(node);
                    }
                }
            }
        }
        ts.forEachChild(innerNode, cb);
    }
    ts.forEachChild(parentNode, cb);
    return topLevelFunctions;
}
exports.findTopLevelFunctions = findTopLevelFunctions;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZml4LWZ1bmN0aW9ucy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2J1aWxkX29wdGltaXplci9zcmMvdHJhbnNmb3Jtcy9wcmVmaXgtZnVuY3Rpb25zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBRUgsK0NBQWlDO0FBQ2pDLG9EQUEwRjtBQUUxRixTQUFnQiw2QkFBNkI7SUFDM0MsT0FBTyxDQUFDLE9BQWlDLEVBQWlDLEVBQUU7UUFDMUUsTUFBTSxXQUFXLEdBQWtDLENBQUMsRUFBaUIsRUFBRSxFQUFFO1lBQ3ZFLE1BQU0saUJBQWlCLEdBQUcscUJBQXFCLENBQUMsRUFBRSxDQUFDLENBQUM7WUFFcEQsTUFBTSxPQUFPLEdBQWUsQ0FBQyxJQUFhLEVBQVcsRUFBRTtnQkFDckQsb0RBQW9EO2dCQUNwRCxJQUFJLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRTtvQkFDL0IsTUFBTSxPQUFPLEdBQUcsSUFBQSwwQkFBYyxFQUFDLElBQUksQ0FBQyxDQUFDO29CQUVyQyxrQ0FBa0M7b0JBQ2xDLE9BQU8sRUFBRSxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2lCQUNyRDtnQkFFRCwrQkFBK0I7Z0JBQy9CLE9BQU8sRUFBRSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ25ELENBQUMsQ0FBQztZQUVGLE9BQU8sRUFBRSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsT0FBTyxDQUFDLENBQUM7UUFDbkMsQ0FBQyxDQUFDO1FBRUYsT0FBTyxXQUFXLENBQUM7SUFDckIsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQXZCRCxzRUF1QkM7QUFFRCxTQUFnQixxQkFBcUIsQ0FBQyxVQUFtQjtJQUN2RCxNQUFNLGlCQUFpQixHQUFHLElBQUksR0FBRyxFQUFXLENBQUM7SUFFN0MsU0FBUyxFQUFFLENBQUMsSUFBYTtRQUN2QixrRUFBa0U7UUFDbEUsMEZBQTBGO1FBQzFGLHFGQUFxRjtRQUNyRixtREFBbUQ7UUFDbkQsK0ZBQStGO1FBQy9GLHlGQUF5RjtRQUN6RixJQUNFLEVBQUUsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDO1lBQ3ZCLEVBQUUsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDO1lBQ3BCLEVBQUUsQ0FBQyxlQUFlLENBQUMsSUFBSSxDQUFDO1lBQ3hCLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsRUFDNUI7WUFDQSxPQUFPO1NBQ1I7UUFFRCxJQUFJLGFBQWEsR0FBRyxDQUFDLElBQUEsMEJBQWMsRUFBQyxJQUFJLENBQUMsQ0FBQztRQUMxQyxJQUFJLFNBQVMsR0FBRyxJQUFJLENBQUM7UUFDckIsT0FBTyxTQUFTLElBQUksRUFBRSxDQUFDLHlCQUF5QixDQUFDLFNBQVMsQ0FBQyxFQUFFO1lBQzNELFNBQVMsR0FBRyxTQUFTLENBQUMsVUFBVSxDQUFDO1lBQ2pDLGFBQWEsR0FBRyxhQUFhLElBQUksQ0FBQyxJQUFBLDBCQUFjLEVBQUMsU0FBUyxDQUFDLENBQUM7U0FDN0Q7UUFFRCxJQUFJLENBQUMsU0FBUyxFQUFFO1lBQ2QsT0FBTztTQUNSO1FBRUQsSUFDRSxDQUFDLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBQ3JFLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLENBQUMsRUFDbEM7WUFDQSw4Q0FBOEM7WUFDOUMsMERBQTBEO1lBQzFELDhCQUE4QjtZQUM5QixPQUFPO1NBQ1I7UUFFRCxJQUFJLGFBQWEsRUFBRTtZQUNqQixJQUFJLEVBQUUsQ0FBQyxlQUFlLENBQUMsU0FBUyxDQUFDLEVBQUU7Z0JBQ2pDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUM3QjtpQkFBTSxJQUFJLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTLENBQUMsRUFBRTtnQkFDekMsSUFBSSxVQUFVLEdBQWtCLFNBQVMsQ0FBQyxVQUFVLENBQUM7Z0JBRXJELElBQUksRUFBRSxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsSUFBSSxJQUFBLDhCQUFrQixFQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsRUFBRTtvQkFDdEUsT0FBTztpQkFDUjtnQkFFRCxPQUFPLFVBQVUsSUFBSSxFQUFFLENBQUMseUJBQXlCLENBQUMsVUFBVSxDQUFDLEVBQUU7b0JBQzdELFVBQVUsR0FBRyxVQUFVLENBQUMsVUFBVSxDQUFDO2lCQUNwQztnQkFFRCxJQUFJLFVBQVUsRUFBRTtvQkFDZCxJQUFJLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxVQUFVLENBQUMsRUFBRTt3QkFDdkMsNkJBQTZCO3dCQUM3QiwyRUFBMkU7d0JBQzNFLElBQUksU0FBUyxDQUFDLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFOzRCQUNwQyxpQkFBaUIsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7eUJBQzdCO3FCQUNGO3lCQUFNO3dCQUNMLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQztxQkFDN0I7aUJBQ0Y7YUFDRjtTQUNGO1FBRUQsRUFBRSxDQUFDLFlBQVksQ0FBQyxTQUFTLEVBQUUsRUFBRSxDQUFDLENBQUM7SUFDakMsQ0FBQztJQUVELEVBQUUsQ0FBQyxZQUFZLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBRWhDLE9BQU8saUJBQWlCLENBQUM7QUFDM0IsQ0FBQztBQTFFRCxzREEwRUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0ICogYXMgdHMgZnJvbSAndHlwZXNjcmlwdCc7XG5pbXBvcnQgeyBhZGRQdXJlQ29tbWVudCwgZ2V0Q2xlYW5IZWxwZXJOYW1lLCBoYXNQdXJlQ29tbWVudCB9IGZyb20gJy4uL2hlbHBlcnMvYXN0LXV0aWxzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGdldFByZWZpeEZ1bmN0aW9uc1RyYW5zZm9ybWVyKCk6IHRzLlRyYW5zZm9ybWVyRmFjdG9yeTx0cy5Tb3VyY2VGaWxlPiB7XG4gIHJldHVybiAoY29udGV4dDogdHMuVHJhbnNmb3JtYXRpb25Db250ZXh0KTogdHMuVHJhbnNmb3JtZXI8dHMuU291cmNlRmlsZT4gPT4ge1xuICAgIGNvbnN0IHRyYW5zZm9ybWVyOiB0cy5UcmFuc2Zvcm1lcjx0cy5Tb3VyY2VGaWxlPiA9IChzZjogdHMuU291cmNlRmlsZSkgPT4ge1xuICAgICAgY29uc3QgdG9wTGV2ZWxGdW5jdGlvbnMgPSBmaW5kVG9wTGV2ZWxGdW5jdGlvbnMoc2YpO1xuXG4gICAgICBjb25zdCB2aXNpdG9yOiB0cy5WaXNpdG9yID0gKG5vZGU6IHRzLk5vZGUpOiB0cy5Ob2RlID0+IHtcbiAgICAgICAgLy8gQWRkIHB1cmUgZnVuY3Rpb24gY29tbWVudCB0byB0b3AgbGV2ZWwgZnVuY3Rpb25zLlxuICAgICAgICBpZiAodG9wTGV2ZWxGdW5jdGlvbnMuaGFzKG5vZGUpKSB7XG4gICAgICAgICAgY29uc3QgbmV3Tm9kZSA9IGFkZFB1cmVDb21tZW50KG5vZGUpO1xuXG4gICAgICAgICAgLy8gUmVwbGFjZSBub2RlIHdpdGggbW9kaWZpZWQgb25lLlxuICAgICAgICAgIHJldHVybiB0cy52aXNpdEVhY2hDaGlsZChuZXdOb2RlLCB2aXNpdG9yLCBjb250ZXh0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE90aGVyd2lzZSByZXR1cm4gbm9kZSBhcyBpcy5cbiAgICAgICAgcmV0dXJuIHRzLnZpc2l0RWFjaENoaWxkKG5vZGUsIHZpc2l0b3IsIGNvbnRleHQpO1xuICAgICAgfTtcblxuICAgICAgcmV0dXJuIHRzLnZpc2l0Tm9kZShzZiwgdmlzaXRvcik7XG4gICAgfTtcblxuICAgIHJldHVybiB0cmFuc2Zvcm1lcjtcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZpbmRUb3BMZXZlbEZ1bmN0aW9ucyhwYXJlbnROb2RlOiB0cy5Ob2RlKTogU2V0PHRzLk5vZGU+IHtcbiAgY29uc3QgdG9wTGV2ZWxGdW5jdGlvbnMgPSBuZXcgU2V0PHRzLk5vZGU+KCk7XG5cbiAgZnVuY3Rpb24gY2Iobm9kZTogdHMuTm9kZSkge1xuICAgIC8vIFN0b3AgcmVjdXJzaW5nIGludG8gdGhpcyBicmFuY2ggaWYgaXQncyBhIGRlZmluaXRpb24gY29uc3RydWN0LlxuICAgIC8vIFRoZXNlIGFyZSBmdW5jdGlvbiBleHByZXNzaW9uLCBmdW5jdGlvbiBkZWNsYXJhdGlvbiwgY2xhc3MsIG9yIGFycm93IGZ1bmN0aW9uIChsYW1iZGEpLlxuICAgIC8vIFRoZSBib2R5IG9mIHRoZXNlIGNvbnN0cnVjdHMgd2lsbCBub3QgZXhlY3V0ZSB3aGVuIGxvYWRpbmcgdGhlIG1vZHVsZSwgc28gd2UgZG9uJ3RcbiAgICAvLyBuZWVkIHRvIG1hcmsgZnVuY3Rpb24gY2FsbHMgaW5zaWRlIHRoZW0gYXMgcHVyZS5cbiAgICAvLyBDbGFzcyBzdGF0aWMgaW5pdGlhbGl6ZXJzIGluIEVTMjAxNSBhcmUgYW4gZXhjZXB0aW9uIHdlIGRvbid0IGNvdmVyLiBUaGV5IHdvdWxkIG5lZWQgc2ltaWxhclxuICAgIC8vIHByb2Nlc3NpbmcgYXMgZW51bXMgdG8gcHJldmVudCBwcm9wZXJ0eSBzZXR0aW5nIGZyb20gY2F1c2luZyB0aGUgY2xhc3MgdG8gYmUgcmV0YWluZWQuXG4gICAgaWYgKFxuICAgICAgdHMuaXNGdW5jdGlvbkxpa2Uobm9kZSkgfHxcbiAgICAgIHRzLmlzQ2xhc3NMaWtlKG5vZGUpIHx8XG4gICAgICB0cy5pc0Fycm93RnVuY3Rpb24obm9kZSkgfHxcbiAgICAgIHRzLmlzTWV0aG9kRGVjbGFyYXRpb24obm9kZSlcbiAgICApIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBsZXQgbm9QdXJlQ29tbWVudCA9ICFoYXNQdXJlQ29tbWVudChub2RlKTtcbiAgICBsZXQgaW5uZXJOb2RlID0gbm9kZTtcbiAgICB3aGlsZSAoaW5uZXJOb2RlICYmIHRzLmlzUGFyZW50aGVzaXplZEV4cHJlc3Npb24oaW5uZXJOb2RlKSkge1xuICAgICAgaW5uZXJOb2RlID0gaW5uZXJOb2RlLmV4cHJlc3Npb247XG4gICAgICBub1B1cmVDb21tZW50ID0gbm9QdXJlQ29tbWVudCAmJiAhaGFzUHVyZUNvbW1lbnQoaW5uZXJOb2RlKTtcbiAgICB9XG5cbiAgICBpZiAoIWlubmVyTm9kZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChcbiAgICAgICh0cy5pc0Z1bmN0aW9uRXhwcmVzc2lvbihpbm5lck5vZGUpIHx8IHRzLmlzQXJyb3dGdW5jdGlvbihpbm5lck5vZGUpKSAmJlxuICAgICAgdHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbihub2RlKVxuICAgICkge1xuICAgICAgLy8gcHVyZSBmdW5jdGlvbnMgY2FuIGJlIHdyYXBwZWQgaW4gcGFyZW50aXplc1xuICAgICAgLy8gd2Ugc2hvdWxkIG5vdCBhZGQgcHVyZSBjb21tZW50cyB0byB0aGlzIHNvcnQgb2Ygc3ludGF4LlxuICAgICAgLy8gZXhhbXBsZSB2YXIgZm9vID0gKCgpID0+IHgpXG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKG5vUHVyZUNvbW1lbnQpIHtcbiAgICAgIGlmICh0cy5pc05ld0V4cHJlc3Npb24oaW5uZXJOb2RlKSkge1xuICAgICAgICB0b3BMZXZlbEZ1bmN0aW9ucy5hZGQobm9kZSk7XG4gICAgICB9IGVsc2UgaWYgKHRzLmlzQ2FsbEV4cHJlc3Npb24oaW5uZXJOb2RlKSkge1xuICAgICAgICBsZXQgZXhwcmVzc2lvbjogdHMuRXhwcmVzc2lvbiA9IGlubmVyTm9kZS5leHByZXNzaW9uO1xuXG4gICAgICAgIGlmICh0cy5pc0lkZW50aWZpZXIoZXhwcmVzc2lvbikgJiYgZ2V0Q2xlYW5IZWxwZXJOYW1lKGV4cHJlc3Npb24udGV4dCkpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB3aGlsZSAoZXhwcmVzc2lvbiAmJiB0cy5pc1BhcmVudGhlc2l6ZWRFeHByZXNzaW9uKGV4cHJlc3Npb24pKSB7XG4gICAgICAgICAgZXhwcmVzc2lvbiA9IGV4cHJlc3Npb24uZXhwcmVzc2lvbjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChleHByZXNzaW9uKSB7XG4gICAgICAgICAgaWYgKHRzLmlzRnVuY3Rpb25FeHByZXNzaW9uKGV4cHJlc3Npb24pKSB7XG4gICAgICAgICAgICAvLyBTa2lwIElJRkUncyB3aXRoIGFyZ3VtZW50c1xuICAgICAgICAgICAgLy8gVGhpcyBjb3VsZCBiZSBpbXByb3ZlZCB0byBjaGVjayBpZiB0aGVyZSBhcmUgYW55IHJlZmVyZW5jZXMgdG8gdmFyaWFibGVzXG4gICAgICAgICAgICBpZiAoaW5uZXJOb2RlLmFyZ3VtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICAgICAgdG9wTGV2ZWxGdW5jdGlvbnMuYWRkKG5vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0b3BMZXZlbEZ1bmN0aW9ucy5hZGQobm9kZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgdHMuZm9yRWFjaENoaWxkKGlubmVyTm9kZSwgY2IpO1xuICB9XG5cbiAgdHMuZm9yRWFjaENoaWxkKHBhcmVudE5vZGUsIGNiKTtcblxuICByZXR1cm4gdG9wTGV2ZWxGdW5jdGlvbnM7XG59XG4iXX0=