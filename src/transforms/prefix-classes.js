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
exports.getPrefixClassesTransformer = exports.testPrefixClasses = void 0;
const ts = __importStar(require("typescript"));
const ast_utils_1 = require("../helpers/ast-utils");
function testPrefixClasses(content) {
    const exportVarSetter = /(?:export )?(?:var|const)\s+(?:\S+)\s*=\s*/;
    const multiLineComment = /\s*(?:\/\*[\s\S]*?\*\/)?\s*/;
    const newLine = /\s*\r?\n\s*/;
    const regexes = [
        [
            /^/,
            exportVarSetter,
            multiLineComment,
            /\(/,
            multiLineComment,
            /\s*function \(\) {/,
            newLine,
            multiLineComment,
            /function (?:\S+)\([^)]*\) \{/,
            newLine,
        ],
        [
            /^/,
            exportVarSetter,
            multiLineComment,
            /\(/,
            multiLineComment,
            /\s*function \(_super\) {/,
            newLine,
            /\S*\.?__extends\(\S+, _super\);/,
        ],
    ].map((arr) => new RegExp(arr.map((x) => x.source).join(''), 'm'));
    return regexes.some((regex) => regex.test(content));
}
exports.testPrefixClasses = testPrefixClasses;
const superParameterName = '_super';
const extendsHelperName = '__extends';
function getPrefixClassesTransformer() {
    return (context) => {
        const transformer = (sf) => {
            const visitor = (node) => {
                // Add pure comment to downleveled classes.
                if (ts.isVariableStatement(node) && isDownleveledClass(node)) {
                    const varDecl = node.declarationList.declarations[0];
                    const varInitializer = varDecl.initializer;
                    // Update node with the pure comment before the variable declaration initializer.
                    const newNode = ts.updateVariableStatement(node, node.modifiers, ts.updateVariableDeclarationList(node.declarationList, [
                        ts.updateVariableDeclaration(varDecl, varDecl.name, varDecl.type, (0, ast_utils_1.addPureComment)(varInitializer)),
                    ]));
                    // Replace node with modified one.
                    return ts.visitEachChild(newNode, visitor, context);
                }
                // Otherwise return node as is.
                return ts.visitEachChild(node, visitor, context);
            };
            return ts.visitEachChild(sf, visitor, context);
        };
        return transformer;
    };
}
exports.getPrefixClassesTransformer = getPrefixClassesTransformer;
// Determine if a node matched the structure of a downleveled TS class.
function isDownleveledClass(node) {
    if (!ts.isVariableStatement(node)) {
        return false;
    }
    if (node.declarationList.declarations.length !== 1) {
        return false;
    }
    const variableDeclaration = node.declarationList.declarations[0];
    if (!ts.isIdentifier(variableDeclaration.name) || !variableDeclaration.initializer) {
        return false;
    }
    let potentialClass = variableDeclaration.initializer;
    // TS 2.3 has an unwrapped class IIFE
    // TS 2.4 uses a function expression wrapper
    // TS 2.5 uses an arrow function wrapper
    if (ts.isParenthesizedExpression(potentialClass)) {
        potentialClass = potentialClass.expression;
    }
    if (!ts.isCallExpression(potentialClass) || potentialClass.arguments.length > 1) {
        return false;
    }
    let wrapperBody;
    if (ts.isFunctionExpression(potentialClass.expression)) {
        wrapperBody = potentialClass.expression.body;
    }
    else if (ts.isArrowFunction(potentialClass.expression) &&
        ts.isBlock(potentialClass.expression.body)) {
        wrapperBody = potentialClass.expression.body;
    }
    else {
        return false;
    }
    if (wrapperBody.statements.length === 0) {
        return false;
    }
    const functionExpression = potentialClass.expression;
    const functionStatements = wrapperBody.statements;
    // need a minimum of two for a function declaration and return statement
    if (functionStatements.length < 2) {
        return false;
    }
    const firstStatement = functionStatements[0];
    // find return statement - may not be last statement
    let returnStatement;
    for (let i = functionStatements.length - 1; i > 0; i--) {
        if (ts.isReturnStatement(functionStatements[i])) {
            returnStatement = functionStatements[i];
            break;
        }
    }
    if (returnStatement == undefined ||
        returnStatement.expression == undefined ||
        !ts.isIdentifier(returnStatement.expression)) {
        return false;
    }
    if (functionExpression.parameters.length === 0) {
        // potential non-extended class or wrapped es2015 class
        return ((ts.isFunctionDeclaration(firstStatement) || ts.isClassDeclaration(firstStatement)) &&
            firstStatement.name !== undefined &&
            returnStatement.expression.text === firstStatement.name.text);
    }
    else if (functionExpression.parameters.length !== 1) {
        return false;
    }
    // Potential extended class
    const functionParameter = functionExpression.parameters[0];
    if (!ts.isIdentifier(functionParameter.name) ||
        functionParameter.name.text !== superParameterName) {
        return false;
    }
    if (functionStatements.length < 3 || !ts.isExpressionStatement(firstStatement)) {
        return false;
    }
    if (!ts.isCallExpression(firstStatement.expression)) {
        return false;
    }
    const extendCallExpression = firstStatement.expression;
    let functionName;
    if (ts.isIdentifier(extendCallExpression.expression)) {
        functionName = extendCallExpression.expression.text;
    }
    else if (ts.isPropertyAccessExpression(extendCallExpression.expression)) {
        functionName = extendCallExpression.expression.name.text;
    }
    if (!functionName || !functionName.endsWith(extendsHelperName)) {
        return false;
    }
    if (extendCallExpression.arguments.length === 0) {
        return false;
    }
    const lastArgument = extendCallExpression.arguments[extendCallExpression.arguments.length - 1];
    if (!ts.isIdentifier(lastArgument) || lastArgument.text !== functionParameter.name.text) {
        return false;
    }
    const secondStatement = functionStatements[1];
    return (ts.isFunctionDeclaration(secondStatement) &&
        secondStatement.name !== undefined &&
        returnStatement.expression.text === secondStatement.name.text);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZml4LWNsYXNzZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9hbmd1bGFyX2RldmtpdC9idWlsZF9vcHRpbWl6ZXIvc3JjL3RyYW5zZm9ybXMvcHJlZml4LWNsYXNzZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7Ozs7R0FNRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUVILCtDQUFpQztBQUNqQyxvREFBc0Q7QUFFdEQsU0FBZ0IsaUJBQWlCLENBQUMsT0FBZTtJQUMvQyxNQUFNLGVBQWUsR0FBRyw0Q0FBNEMsQ0FBQztJQUNyRSxNQUFNLGdCQUFnQixHQUFHLDZCQUE2QixDQUFDO0lBQ3ZELE1BQU0sT0FBTyxHQUFHLGFBQWEsQ0FBQztJQUU5QixNQUFNLE9BQU8sR0FBRztRQUNkO1lBQ0UsR0FBRztZQUNILGVBQWU7WUFDZixnQkFBZ0I7WUFDaEIsSUFBSTtZQUNKLGdCQUFnQjtZQUNoQixvQkFBb0I7WUFDcEIsT0FBTztZQUNQLGdCQUFnQjtZQUNoQiw4QkFBOEI7WUFDOUIsT0FBTztTQUNSO1FBQ0Q7WUFDRSxHQUFHO1lBQ0gsZUFBZTtZQUNmLGdCQUFnQjtZQUNoQixJQUFJO1lBQ0osZ0JBQWdCO1lBQ2hCLDBCQUEwQjtZQUMxQixPQUFPO1lBQ1AsaUNBQWlDO1NBQ2xDO0tBQ0YsQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLEVBQUUsRUFBRSxDQUFDLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUVuRSxPQUFPLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztB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QVUsQ0FBQyxJQUFJLENBQUM7S0FDckQ7U0FBTSxJQUFJLEVBQUUsQ0FBQywwQkFBMEIsQ0FBQyxvQkFBb0IsQ0FBQyxVQUFVLENBQUMsRUFBRTtRQUN6RSxZQUFZLEdBQUcsb0JBQW9CLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7S0FDMUQ7SUFFRCxJQUFJLENBQUMsWUFBWSxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFO1FBQzlELE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCxJQUFJLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1FBQy9DLE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCxNQUFNLFlBQVksR0FBRyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztJQUUvRixJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUMsSUFBSSxZQUFZLENBQUMsSUFBSSxLQUFLLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUU7UUFDdkYsT0FBTyxLQUFLLENBQUM7S0FDZDtJQUVELE1BQU0sZUFBZSxHQUFHLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRTlDLE9BQU8sQ0FDTCxFQUFFLENBQUMscUJBQXFCLENBQUMsZUFBZSxDQUFDO1FBQ3pDLGVBQWUsQ0FBQyxJQUFJLEtBQUssU0FBUztRQUNsQyxlQUFlLENBQUMsVUFBVSxDQUFDLElBQUksS0FBSyxlQUFlLENBQUMsSUFBSSxDQUFDLElBQUksQ0FDOUQsQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0ICogYXMgdHMgZnJvbSAndHlwZXNjcmlwdCc7XG5pbXBvcnQgeyBhZGRQdXJlQ29tbWVudCB9IGZyb20gJy4uL2hlbHBlcnMvYXN0LXV0aWxzJztcblxuZXhwb3J0IGZ1bmN0aW9uIHRlc3RQcmVmaXhDbGFzc2VzKGNvbnRlbnQ6IHN0cmluZykge1xuICBjb25zdCBleHBvcnRWYXJTZXR0ZXIgPSAvKD86ZXhwb3J0ICk/KD86dmFyfGNvbnN0KVxccysoPzpcXFMrKVxccyo9XFxzKi87XG4gIGNvbnN0IG11bHRpTGluZUNvbW1lbnQgPSAvXFxzKig/OlxcL1xcKltcXHNcXFNdKj9cXCpcXC8pP1xccyovO1xuICBjb25zdCBuZXdMaW5lID0gL1xccypcXHI/XFxuXFxzKi87XG5cbiAgY29uc3QgcmVnZXhlcyA9IFtcbiAgICBbXG4gICAgICAvXi8sXG4gICAgICBleHBvcnRWYXJTZXR0ZXIsXG4gICAgICBtdWx0aUxpbmVDb21tZW50LFxuICAgICAgL1xcKC8sXG4gICAgICBtdWx0aUxpbmVDb21tZW50LFxuICAgICAgL1xccypmdW5jdGlvbiBcXChcXCkgey8sXG4gICAgICBuZXdMaW5lLFxuICAgICAgbXVsdGlMaW5lQ29tbWVudCxcbiAgICAgIC9mdW5jdGlvbiAoPzpcXFMrKVxcKFteKV0qXFwpIFxcey8sXG4gICAgICBuZXdMaW5lLFxuICAgIF0sXG4gICAgW1xuICAgICAgL14vLFxuICAgICAgZXhwb3J0VmFyU2V0dGVyLFxuICAgICAgbXVsdGlMaW5lQ29tbWVudCxcbiAgICAgIC9cXCgvLFxuICAgICAgbXVsdGlMaW5lQ29tbWVudCxcbiAgICAgIC9cXHMqZnVuY3Rpb24gXFwoX3N1cGVyXFwpIHsvLFxuICAgICAgbmV3TGluZSxcbiAgICAgIC9cXFMqXFwuP19fZXh0ZW5kc1xcKFxcUyssIF9zdXBlclxcKTsvLFxuICAgIF0sXG4gIF0ubWFwKChhcnIpID0+IG5ldyBSZWdFeHAoYXJyLm1hcCgoeCkgPT4geC5zb3VyY2UpLmpvaW4oJycpLCAnbScpKTtcblxuICByZXR1cm4gcmVnZXhlcy5zb21lKChyZWdleCkgPT4gcmVnZXgudGVzdChjb250ZW50KSk7XG59XG5cbmNvbnN0IHN1cGVyUGFyYW1ldGVyTmFtZSA9ICdfc3VwZXInO1xuY29uc3QgZXh0ZW5kc0hlbHBlck5hbWUgPSAnX19leHRlbmRzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGdldFByZWZpeENsYXNzZXNUcmFuc2Zvcm1lcigpOiB0cy5UcmFuc2Zvcm1lckZhY3Rvcnk8dHMuU291cmNlRmlsZT4ge1xuICByZXR1cm4gKGNvbnRleHQ6IHRzLlRyYW5zZm9ybWF0aW9uQ29udGV4dCk6IHRzLlRyYW5zZm9ybWVyPHRzLlNvdXJjZUZpbGU+ID0+IHtcbiAgICBjb25zdCB0cmFuc2Zvcm1lcjogdHMuVHJhbnNmb3JtZXI8dHMuU291cmNlRmlsZT4gPSAoc2Y6IHRzLlNvdXJjZUZpbGUpID0+IHtcbiAgICAgIGNvbnN0IHZpc2l0b3I6IHRzLlZpc2l0b3IgPSAobm9kZTogdHMuTm9kZSk6IHRzLlZpc2l0UmVzdWx0PHRzLk5vZGU+ID0+IHtcbiAgICAgICAgLy8gQWRkIHB1cmUgY29tbWVudCB0byBkb3dubGV2ZWxlZCBjbGFzc2VzLlxuICAgICAgICBpZiAodHMuaXNWYXJpYWJsZVN0YXRlbWVudChub2RlKSAmJiBpc0Rvd25sZXZlbGVkQ2xhc3Mobm9kZSkpIHtcbiAgICAgICAgICBjb25zdCB2YXJEZWNsID0gbm9kZS5kZWNsYXJhdGlvbkxpc3QuZGVjbGFyYXRpb25zWzBdO1xuICAgICAgICAgIGNvbnN0IHZhckluaXRpYWxpemVyID0gdmFyRGVjbC5pbml0aWFsaXplciBhcyB0cy5FeHByZXNzaW9uO1xuXG4gICAgICAgICAgLy8gVXBkYXRlIG5vZGUgd2l0aCB0aGUgcHVyZSBjb21tZW50IGJlZm9yZSB0aGUgdmFyaWFibGUgZGVjbGFyYXRpb24gaW5pdGlhbGl6ZXIuXG4gICAgICAgICAgY29uc3QgbmV3Tm9kZSA9IHRzLnVwZGF0ZVZhcmlhYmxlU3RhdGVtZW50KFxuICAgICAgICAgICAgbm9kZSxcbiAgICAgICAgICAgIG5vZGUubW9kaWZpZXJzLFxuICAgICAgICAgICAgdHMudXBkYXRlVmFyaWFibGVEZWNsYXJhdGlvbkxpc3Qobm9kZS5kZWNsYXJhdGlvbkxpc3QsIFtcbiAgICAgICAgICAgICAgdHMudXBkYXRlVmFyaWFibGVEZWNsYXJhdGlvbihcbiAgICAgICAgICAgICAgICB2YXJEZWNsLFxuICAgICAgICAgICAgICAgIHZhckRlY2wubmFtZSxcbiAgICAgICAgICAgICAgICB2YXJEZWNsLnR5cGUsXG4gICAgICAgICAgICAgICAgYWRkUHVyZUNvbW1lbnQodmFySW5pdGlhbGl6ZXIpLFxuICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgXSksXG4gICAgICAgICAgKTtcblxuICAgICAgICAgIC8vIFJlcGxhY2Ugbm9kZSB3aXRoIG1vZGlmaWVkIG9uZS5cbiAgICAgICAgICByZXR1cm4gdHMudmlzaXRFYWNoQ2hpbGQobmV3Tm9kZSwgdmlzaXRvciwgY29udGV4dCk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBPdGhlcndpc2UgcmV0dXJuIG5vZGUgYXMgaXMuXG4gICAgICAgIHJldHVybiB0cy52aXNpdEVhY2hDaGlsZChub2RlLCB2aXNpdG9yLCBjb250ZXh0KTtcbiAgICAgIH07XG5cbiAgICAgIHJldHVybiB0cy52aXNpdEVhY2hDaGlsZChzZiwgdmlzaXRvciwgY29udGV4dCk7XG4gICAgfTtcblxuICAgIHJldHVybiB0cmFuc2Zvcm1lcjtcbiAgfTtcbn1cblxuLy8gRGV0ZXJtaW5lIGlmIGEgbm9kZSBtYXRjaGVkIHRoZSBzdHJ1Y3R1cmUgb2YgYSBkb3dubGV2ZWxlZCBUUyBjbGFzcy5cbmZ1bmN0aW9uIGlzRG93bmxldmVsZWRDbGFzcyhub2RlOiB0cy5Ob2RlKTogYm9vbGVhbiB7XG4gIGlmICghdHMuaXNWYXJpYWJsZVN0YXRlbWVudChub2RlKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlmIChub2RlLmRlY2xhcmF0aW9uTGlzdC5kZWNsYXJhdGlvbnMubGVuZ3RoICE9PSAxKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgdmFyaWFibGVEZWNsYXJhdGlvbiA9IG5vZGUuZGVjbGFyYXRpb25MaXN0LmRlY2xhcmF0aW9uc1swXTtcblxuICBpZiAoIXRzLmlzSWRlbnRpZmllcih2YXJpYWJsZURlY2xhcmF0aW9uLm5hbWUpIHx8ICF2YXJpYWJsZURlY2xhcmF0aW9uLmluaXRpYWxpemVyKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgbGV0IHBvdGVudGlhbENsYXNzID0gdmFyaWFibGVEZWNsYXJhdGlvbi5pbml0aWFsaXplcjtcblxuICAvLyBUUyAyLjMgaGFzIGFuIHVud3JhcHBlZCBjbGFzcyBJSUZFXG4gIC8vIFRTIDIuNCB1c2VzIGEgZnVuY3Rpb24gZXhwcmVzc2lvbiB3cmFwcGVyXG4gIC8vIFRTIDIuNSB1c2VzIGFuIGFycm93IGZ1bmN0aW9uIHdyYXBwZXJcbiAgaWYgKHRzLmlzUGFyZW50aGVzaXplZEV4cHJlc3Npb24ocG90ZW50aWFsQ2xhc3MpKSB7XG4gICAgcG90ZW50aWFsQ2xhc3MgPSBwb3RlbnRpYWxDbGFzcy5leHByZXNzaW9uO1xuICB9XG5cbiAgaWYgKCF0cy5pc0NhbGxFeHByZXNzaW9uKHBvdGVudGlhbENsYXNzKSB8fCBwb3RlbnRpYWxDbGFzcy5hcmd1bWVudHMubGVuZ3RoID4gMSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGxldCB3cmFwcGVyQm9keTogdHMuQmxvY2s7XG4gIGlmICh0cy5pc0Z1bmN0aW9uRXhwcmVzc2lvbihwb3RlbnRpYWxDbGFzcy5leHByZXNzaW9uKSkge1xuICAgIHdyYXBwZXJCb2R5ID0gcG90ZW50aWFsQ2xhc3MuZXhwcmVzc2lvbi5ib2R5O1xuICB9IGVsc2UgaWYgKFxuICAgIHRzLmlzQXJyb3dGdW5jdGlvbihwb3RlbnRpYWxDbGFzcy5leHByZXNzaW9uKSAmJlxuICAgIHRzLmlzQmxvY2socG90ZW50aWFsQ2xhc3MuZXhwcmVzc2lvbi5ib2R5KVxuICApIHtcbiAgICB3cmFwcGVyQm9keSA9IHBvdGVudGlhbENsYXNzLmV4cHJlc3Npb24uYm9keTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAod3JhcHBlckJvZHkuc3RhdGVtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBjb25zdCBmdW5jdGlvbkV4cHJlc3Npb24gPSBwb3RlbnRpYWxDbGFzcy5leHByZXNzaW9uO1xuICBjb25zdCBmdW5jdGlvblN0YXRlbWVudHMgPSB3cmFwcGVyQm9keS5zdGF0ZW1lbnRzO1xuXG4gIC8vIG5lZWQgYSBtaW5pbXVtIG9mIHR3byBmb3IgYSBmdW5jdGlvbiBkZWNsYXJhdGlvbiBhbmQgcmV0dXJuIHN0YXRlbWVudFxuICBpZiAoZnVuY3Rpb25TdGF0ZW1lbnRzLmxlbmd0aCA8IDIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBjb25zdCBmaXJzdFN0YXRlbWVudCA9IGZ1bmN0aW9uU3RhdGVtZW50c1swXTtcblxuICAvLyBmaW5kIHJldHVybiBzdGF0ZW1lbnQgLSBtYXkgbm90IGJlIGxhc3Qgc3RhdGVtZW50XG4gIGxldCByZXR1cm5TdGF0ZW1lbnQ6IHRzLlJldHVyblN0YXRlbWVudCB8IHVuZGVmaW5lZDtcbiAgZm9yIChsZXQgaSA9IGZ1bmN0aW9uU3RhdGVtZW50cy5sZW5ndGggLSAxOyBpID4gMDsgaS0tKSB7XG4gICAgaWYgKHRzLmlzUmV0dXJuU3RhdGVtZW50KGZ1bmN0aW9uU3RhdGVtZW50c1tpXSkpIHtcbiAgICAgIHJldHVyblN0YXRlbWVudCA9IGZ1bmN0aW9uU3RhdGVtZW50c1tpXSBhcyB0cy5SZXR1cm5TdGF0ZW1lbnQ7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICBpZiAoXG4gICAgcmV0dXJuU3RhdGVtZW50ID09IHVuZGVmaW5lZCB8fFxuICAgIHJldHVyblN0YXRlbWVudC5leHByZXNzaW9uID09IHVuZGVmaW5lZCB8fFxuICAgICF0cy5pc0lkZW50aWZpZXIocmV0dXJuU3RhdGVtZW50LmV4cHJlc3Npb24pXG4gICkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlmIChmdW5jdGlvbkV4cHJlc3Npb24ucGFyYW1ldGVycy5sZW5ndGggPT09IDApIHtcbiAgICAvLyBwb3RlbnRpYWwgbm9uLWV4dGVuZGVkIGNsYXNzIG9yIHdyYXBwZWQgZXMyMDE1IGNsYXNzXG4gICAgcmV0dXJuIChcbiAgICAgICh0cy5pc0Z1bmN0aW9uRGVjbGFyYXRpb24oZmlyc3RTdGF0ZW1lbnQpIHx8IHRzLmlzQ2xhc3NEZWNsYXJhdGlvbihmaXJzdFN0YXRlbWVudCkpICYmXG4gICAgICBmaXJzdFN0YXRlbWVudC5uYW1lICE9PSB1bmRlZmluZWQgJiZcbiAgICAgIHJldHVyblN0YXRlbWVudC5leHByZXNzaW9uLnRleHQgPT09IGZpcnN0U3RhdGVtZW50Lm5hbWUudGV4dFxuICAgICk7XG4gIH0gZWxzZSBpZiAoZnVuY3Rpb25FeHByZXNzaW9uLnBhcmFtZXRlcnMubGVuZ3RoICE9PSAxKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgLy8gUG90ZW50aWFsIGV4dGVuZGVkIGNsYXNzXG5cbiAgY29uc3QgZnVuY3Rpb25QYXJhbWV0ZXIgPSBmdW5jdGlvbkV4cHJlc3Npb24ucGFyYW1ldGVyc1swXTtcblxuICBpZiAoXG4gICAgIXRzLmlzSWRlbnRpZmllcihmdW5jdGlvblBhcmFtZXRlci5uYW1lKSB8fFxuICAgIGZ1bmN0aW9uUGFyYW1ldGVyLm5hbWUudGV4dCAhPT0gc3VwZXJQYXJhbWV0ZXJOYW1lXG4gICkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlmIChmdW5jdGlvblN0YXRlbWVudHMubGVuZ3RoIDwgMyB8fCAhdHMuaXNFeHByZXNzaW9uU3RhdGVtZW50KGZpcnN0U3RhdGVtZW50KSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlmICghdHMuaXNDYWxsRXhwcmVzc2lvbihmaXJzdFN0YXRlbWVudC5leHByZXNzaW9uKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IGV4dGVuZENhbGxFeHByZXNzaW9uID0gZmlyc3RTdGF0ZW1lbnQuZXhwcmVzc2lvbjtcblxuICBsZXQgZnVuY3Rpb25OYW1lO1xuICBpZiAodHMuaXNJZGVudGlmaWVyKGV4dGVuZENhbGxFeHByZXNzaW9uLmV4cHJlc3Npb24pKSB7XG4gICAgZnVuY3Rpb25OYW1lID0gZXh0ZW5kQ2FsbEV4cHJlc3Npb24uZXhwcmVzc2lvbi50ZXh0O1xuICB9IGVsc2UgaWYgKHRzLmlzUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKGV4dGVuZENhbGxFeHByZXNzaW9uLmV4cHJlc3Npb24pKSB7XG4gICAgZnVuY3Rpb25OYW1lID0gZXh0ZW5kQ2FsbEV4cHJlc3Npb24uZXhwcmVzc2lvbi5uYW1lLnRleHQ7XG4gIH1cblxuICBpZiAoIWZ1bmN0aW9uTmFtZSB8fCAhZnVuY3Rpb25OYW1lLmVuZHNXaXRoKGV4dGVuZHNIZWxwZXJOYW1lKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlmIChleHRlbmRDYWxsRXhwcmVzc2lvbi5hcmd1bWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgbGFzdEFyZ3VtZW50ID0gZXh0ZW5kQ2FsbEV4cHJlc3Npb24uYXJndW1lbnRzW2V4dGVuZENhbGxFeHByZXNzaW9uLmFyZ3VtZW50cy5sZW5ndGggLSAxXTtcblxuICBpZiAoIXRzLmlzSWRlbnRpZmllcihsYXN0QXJndW1lbnQpIHx8IGxhc3RBcmd1bWVudC50ZXh0ICE9PSBmdW5jdGlvblBhcmFtZXRlci5uYW1lLnRleHQpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBjb25zdCBzZWNvbmRTdGF0ZW1lbnQgPSBmdW5jdGlvblN0YXRlbWVudHNbMV07XG5cbiAgcmV0dXJuIChcbiAgICB0cy5pc0Z1bmN0aW9uRGVjbGFyYXRpb24oc2Vjb25kU3RhdGVtZW50KSAmJlxuICAgIHNlY29uZFN0YXRlbWVudC5uYW1lICE9PSB1bmRlZmluZWQgJiZcbiAgICByZXR1cm5TdGF0ZW1lbnQuZXhwcmVzc2lvbi50ZXh0ID09PSBzZWNvbmRTdGF0ZW1lbnQubmFtZS50ZXh0XG4gICk7XG59XG4iXX0=