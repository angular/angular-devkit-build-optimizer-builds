"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
const ts = require("typescript");
/**
 * @deprecated From 0.9.0
 */
function testPrefixClasses(content) {
    const exportVarSetter = /(?:export )?(?:var|const)\s+(?:\S+)\s*=\s*/;
    const multiLineComment = /\s*(?:\/\*[\s\S]*?\*\/)?\s*/;
    const newLine = /\s*\r?\n\s*/;
    const regexes = [
        [
            /^/,
            exportVarSetter, multiLineComment,
            /\(/, multiLineComment,
            /\s*function \(\) {/, newLine,
            multiLineComment,
            /function (?:\S+)\([^\)]*\) \{/, newLine,
        ],
        [
            /^/,
            exportVarSetter, multiLineComment,
            /\(/, multiLineComment,
            /\s*function \(_super\) {/, newLine,
            /\w*\.?__extends\(\w+, _super\);/,
        ],
    ].map(arr => new RegExp(arr.map(x => x.source).join(''), 'm'));
    return regexes.some((regex) => regex.test(content));
}
exports.testPrefixClasses = testPrefixClasses;
const superParameterName = '_super';
const extendsHelperName = '__extends';
function getPrefixClassesTransformer() {
    return (context) => {
        const transformer = (sf) => {
            const pureFunctionComment = '@__PURE__';
            const visitor = (node) => {
                // Add pure comment to downleveled classes.
                if (ts.isVariableStatement(node) && isDownleveledClass(node)) {
                    const varDecl = node.declarationList.declarations[0];
                    const varInitializer = varDecl.initializer;
                    // Update node with the pure comment before the variable declaration initializer.
                    const newNode = ts.updateVariableStatement(node, node.modifiers, ts.updateVariableDeclarationList(node.declarationList, [
                        ts.updateVariableDeclaration(varDecl, varDecl.name, varDecl.type, ts.addSyntheticLeadingComment(varInitializer, ts.SyntaxKind.MultiLineCommentTrivia, pureFunctionComment, false)),
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
    if (!ts.isIdentifier(variableDeclaration.name)
        || !variableDeclaration.initializer) {
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
    else if (ts.isArrowFunction(potentialClass.expression)
        && ts.isBlock(potentialClass.expression.body)) {
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
    if (returnStatement == undefined
        || returnStatement.expression == undefined
        || !ts.isIdentifier(returnStatement.expression)) {
        return false;
    }
    if (functionExpression.parameters.length === 0) {
        // potential non-extended class or wrapped es2015 class
        return (ts.isFunctionDeclaration(firstStatement) || ts.isClassDeclaration(firstStatement))
            && firstStatement.name !== undefined
            && returnStatement.expression.text === firstStatement.name.text;
    }
    else if (functionExpression.parameters.length !== 1) {
        return false;
    }
    // Potential extended class
    const functionParameter = functionExpression.parameters[0];
    if (!ts.isIdentifier(functionParameter.name)
        || functionParameter.name.text !== superParameterName) {
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
    return ts.isFunctionDeclaration(secondStatement)
        && secondStatement.name !== undefined
        && returnStatement.expression.text === secondStatement.name.text;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJlZml4LWNsYXNzZXMuanMiLCJzb3VyY2VSb290IjoiLi8iLCJzb3VyY2VzIjpbInBhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2J1aWxkX29wdGltaXplci9zcmMvdHJhbnNmb3Jtcy9wcmVmaXgtY2xhc3Nlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQUFBOzs7Ozs7R0FNRztBQUNILGlDQUFpQztBQUVqQzs7R0FFRztBQUNILFNBQWdCLGlCQUFpQixDQUFDLE9BQWU7SUFDL0MsTUFBTSxlQUFlLEdBQUcsNENBQTRDLENBQUM7SUFDckUsTUFBTSxnQkFBZ0IsR0FBRyw2QkFBNkIsQ0FBQztJQUN2RCxNQUFNLE9BQU8sR0FBRyxhQUFhLENBQUM7SUFFOUIsTUFBTSxPQUFPLEdBQUc7UUFDZDtZQUNFLEdBQUc7WUFDSCxlQUFlLEVBQUUsZ0JBQWdCO1lBQ2pDLElBQUksRUFBRSxnQkFBZ0I7WUFDdEIsb0JBQW9CLEVBQUUsT0FBTztZQUM3QixnQkFBZ0I7WUFDaEIsK0JBQStCLEVBQUUsT0FBTztTQUN6QztRQUNEO1lBQ0UsR0FBRztZQUNILGVBQWUsRUFBRSxnQkFBZ0I7WUFDakMsSUFBSSxFQUFFLGdCQUFnQjtZQUN0QiwwQkFBMEIsRUFBRSxPQUFPO1lBQ25DLGlDQUFpQztTQUNsQztLQUNGLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxNQUFNLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsR0FBRyxDQUFDLENBQUMsQ0FBQztJQUUvRCxPQUFPLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztBQUN0RCxDQUFDO0FBeEJELDhDQXdCQztBQUVELE1BQU0sa0JBQWtCLEdBQUcsUUFBUSxDQUFDO0FBQ3BDLE1BQU0saUJBQWlCLEdBQUcsV0FBVyxDQUFDO0FBRXRDLFNBQWdCLDJCQUEyQjtJQUN6QyxPQUFPLENBQUMsT0FBaUMsRUFBaUMsRUFBRTtRQUMxRSxNQUFNLFdBQVcsR0FBa0MsQ0FBQyxFQUFpQixFQUFFLEVBQUU7WUFFdkUsTUFBTSxtQkFBbUIsR0FBRyxXQUFXLENBQUM7WUFFeEMsTUFBTSxPQUFPLEdBQWUsQ0FBQyxJQUFhLEVBQTJCLEVBQUU7Z0JBRXJFLDJDQUEyQztnQkFDM0MsSUFBSSxFQUFFLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLElBQUksa0JBQWtCLENBQUMsSUFBSSxDQUFDLEVBQUU7b0JBQzVELE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNyRCxNQUFNLGNBQWMsR0FBRyxPQUFPLENBQUMsV0FBNEIsQ0FBQztvQkFFNUQsaUZBQWlGO29CQUNqRixNQUFNLE9BQU8sR0FBRyxFQUFFLENBQUMsdUJBQXVCLENBQ3hDLElBQUksRUFDSixJQUFJLENBQUMsU0FBUyxFQUNkLEVBQUUsQ0FBQyw2QkFBNkIsQ0FDOUIsSUFBSSxDQUFDLGVBQWUsRUFDcEI7d0JBQ0UsRUFBRSxDQUFDLHlCQUF5QixDQUMxQixPQUFPLEVBQ1AsT0FBTyxDQUFDLElBQUksRUFDWixPQUFPLENBQUMsSUFBSSxFQUNaLEVBQUUsQ0FBQywwQkFBMEIsQ0FDM0IsY0FBYyxFQUNkLEVBQUUsQ0FBQyxVQUFVLENBQUMsc0JBQXNCLEVBQ3BDLG1CQUFtQixFQUNuQixLQUFLLENBQ04sQ0FDRjtxQkFDRixDQUNGLENBQ0YsQ0FBQztvQkFFRixrQ0FBa0M7b0JBQ2xDLE9BQU8sRUFBRSxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO2lCQUNyRDtnQkFFRCwrQkFBK0I7Z0JBQy9CLE9BQU8sRUFBRSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBQ25ELENBQUMsQ0FBQztZQUVGLE9BQU8sRUFBRSxDQUFDLGNBQWMsQ0FBQyxFQUFFLEVBQUUsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ2pELENBQUMsQ0FBQztRQUVGLE9BQU8sV0FBVyxDQUFDO0lBQ3JCLENBQUMsQ0FBQztBQUNKLENBQUM7QUFoREQsa0VBZ0RDO0FBRUQsdUVBQXVFO0FBQ3ZFLFNBQVMsa0JBQWtCLENBQUMsSUFBYTtJQUV2QyxJQUFJLENBQUMsRUFBRSxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxFQUFFO1FBQ2pDLE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCxJQUFJLElBQUksQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7UUFDbEQsT0FBTyxLQUFLLENBQUM7S0FDZDtJQUVELE1BQU0sbUJBQW1CLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFakUsSUFBSSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDO1dBQ3ZDLENBQUMsbUJBQW1CLENBQUMsV0FBVyxFQUFFO1FBQ3ZDLE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCxJQUFJLGNBQWMsR0FBRyxtQkFBbUIsQ0FBQyxXQUFXLENBQUM7SUFFckQscUNBQXFDO0lBQ3JDLDRDQUE0QztJQUM1Qyx3Q0FBd0M7SUFDeEMsSUFBSSxFQUFFLENBQUMseUJBQXlCLENBQUMsY0FBYyxDQUFDLEVBQUU7UUFDaEQsY0FBYyxHQUFHLGNBQWMsQ0FBQyxVQUFVLENBQUM7S0FDNUM7SUFFRCxJQUFJLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLGNBQWMsQ0FBQyxJQUFJLGNBQWMsQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtRQUMvRSxPQUFPLEtBQUssQ0FBQztLQUNkO0lBRUQsSUFBSSxXQUFxQixDQUFDO0lBQzFCLElBQUksRUFBRSxDQUFDLG9CQUFvQixDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsRUFBRTtRQUN0RCxXQUFXLEdBQUcsY0FBYyxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUM7S0FDOUM7U0FBTSxJQUFJLEVBQUUsQ0FBQyxlQUFlLENBQUMsY0FBYyxDQUFDLFVBQVUsQ0FBQztXQUMxQyxFQUFFLENBQUMsT0FBTyxDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQUU7UUFDeEQsV0FBVyxHQUFHLGNBQWMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDO0tBQzlDO1NBQU07UUFDTCxPQUFPLEtBQUssQ0FBQztLQUNkO0lBRUQsSUFBSSxXQUFXLENBQUMsVUFBVSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7UUFDdkMsT0FBTyxLQUFLLENBQUM7S0FDZDtJQUVELE1BQU0sa0JBQWtCLEdBQUcsY0FBYyxDQUFDLFVBQVUsQ0FBQztJQUNyRCxNQUFNLGtCQUFrQixHQUFHLFdBQVcsQ0FBQyxVQUFVLENBQUM7SUFFbEQsd0VBQXdFO0lBQ3hFLElBQUksa0JBQWtCLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtRQUNqQyxPQUFPLEtBQUssQ0FBQztLQUNkO0lBRUQsTUFBTSxjQUFjLEdBQUcsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFN0Msb0RBQW9EO0lBQ3BELElBQUksZUFBK0MsQ0FBQztJQUNwRCxLQUFLLElBQUksQ0FBQyxHQUFHLGtCQUFrQixDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEVBQUUsRUFBRTtRQUN0RCxJQUFJLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO1lBQy9DLGVBQWUsR0FBRyxrQkFBa0IsQ0FBQyxDQUFDLENBQXVCLENBQUM7WUFDOUQsTUFBTTtTQUNQO0tBQ0Y7SUFFRCxJQUFJLGVBQWUsSUFBSSxTQUFTO1dBQ3pCLGVBQWUsQ0FBQyxVQUFVLElBQUksU0FBUztXQUN2QyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxFQUFFO1FBQ25ELE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCxJQUFJLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1FBQzlDLHVEQUF1RDtRQUN2RCxPQUFPLENBQUMsRUFBRSxDQUFDLHFCQUFxQixDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxjQUFjLENBQUMsQ0FBQztlQUNoRixjQUFjLENBQUMsSUFBSSxLQUFLLFNBQVM7ZUFDakMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEtBQUssY0FBYyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7S0FDeEU7U0FBTSxJQUFJLGtCQUFrQixDQUFDLFVBQVUsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1FBQ3JELE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCwyQkFBMkI7SUFFM0IsTUFBTSxpQkFBaUIsR0FBRyxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFM0QsSUFBSSxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsaUJBQWlCLENBQUMsSUFBSSxDQUFDO1dBQ3JDLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssa0JBQWtCLEVBQUU7UUFDekQsT0FBTyxLQUFLLENBQUM7S0FDZDtJQUVELElBQUksa0JBQWtCLENBQUMsTUFBTSxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsRUFBRTtRQUM5RSxPQUFPLEtBQUssQ0FBQztLQUNkO0lBRUQsSUFBSSxDQUFDLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxjQUFjLENBQUMsVUFBVSxDQUFDLEVBQUU7UUFDbkQsT0FBTyxLQUFLLENBQUM7S0FDZDtJQUVELE1BQU0sb0JBQW9CLEdBQUcsY0FBYyxDQUFDLFVBQVUsQ0FBQztJQUV2RCxJQUFJLFlBQVksQ0FBQztJQUNqQixJQUFJLEVBQUUsQ0FBQyxZQUFZLENBQUMsb0JBQW9CLENBQUMsVUFBVSxDQUFDLEVBQUU7UUFDcEQsWUFBWSxHQUFHLG9CQUFvQixDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUM7S0FDckQ7U0FBTSxJQUFJLEVBQUUsQ0FBQywwQkFBMEIsQ0FBQyxvQkFBb0IsQ0FBQyxVQUFVLENBQUMsRUFBRTtRQUN6RSxZQUFZLEdBQUcsb0JBQW9CLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7S0FDMUQ7SUFFRCxJQUFJLENBQUMsWUFBWSxJQUFJLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFO1FBQzlELE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCxJQUFJLG9CQUFvQixDQUFDLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1FBQy9DLE9BQU8sS0FBSyxDQUFDO0tBQ2Q7SUFFRCxNQUFNLFlBQVksR0FBRyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsb0JBQW9CLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQztJQUUvRixJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxZQUFZLENBQUMsSUFBSSxZQUFZLENBQUMsSUFBSSxLQUFLLGlCQUFpQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUU7UUFDdkYsT0FBTyxLQUFLLENBQUM7S0FDZDtJQUVELE1BQU0sZUFBZSxHQUFHLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDO0lBRTlDLE9BQU8sRUFBRSxDQUFDLHFCQUFxQixDQUFDLGVBQWUsQ0FBQztXQUN0QyxlQUFlLENBQUMsSUFBSSxLQUFLLFNBQVM7V0FDbEMsZUFBZSxDQUFDLFVBQVUsQ0FBQyxJQUFJLEtBQUssZUFBZSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7QUFDMUUsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cbmltcG9ydCAqIGFzIHRzIGZyb20gJ3R5cGVzY3JpcHQnO1xuXG4vKipcbiAqIEBkZXByZWNhdGVkIEZyb20gMC45LjBcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHRlc3RQcmVmaXhDbGFzc2VzKGNvbnRlbnQ6IHN0cmluZykge1xuICBjb25zdCBleHBvcnRWYXJTZXR0ZXIgPSAvKD86ZXhwb3J0ICk/KD86dmFyfGNvbnN0KVxccysoPzpcXFMrKVxccyo9XFxzKi87XG4gIGNvbnN0IG11bHRpTGluZUNvbW1lbnQgPSAvXFxzKig/OlxcL1xcKltcXHNcXFNdKj9cXCpcXC8pP1xccyovO1xuICBjb25zdCBuZXdMaW5lID0gL1xccypcXHI/XFxuXFxzKi87XG5cbiAgY29uc3QgcmVnZXhlcyA9IFtcbiAgICBbXG4gICAgICAvXi8sXG4gICAgICBleHBvcnRWYXJTZXR0ZXIsIG11bHRpTGluZUNvbW1lbnQsXG4gICAgICAvXFwoLywgbXVsdGlMaW5lQ29tbWVudCxcbiAgICAgIC9cXHMqZnVuY3Rpb24gXFwoXFwpIHsvLCBuZXdMaW5lLFxuICAgICAgbXVsdGlMaW5lQ29tbWVudCxcbiAgICAgIC9mdW5jdGlvbiAoPzpcXFMrKVxcKFteXFwpXSpcXCkgXFx7LywgbmV3TGluZSxcbiAgICBdLFxuICAgIFtcbiAgICAgIC9eLyxcbiAgICAgIGV4cG9ydFZhclNldHRlciwgbXVsdGlMaW5lQ29tbWVudCxcbiAgICAgIC9cXCgvLCBtdWx0aUxpbmVDb21tZW50LFxuICAgICAgL1xccypmdW5jdGlvbiBcXChfc3VwZXJcXCkgey8sIG5ld0xpbmUsXG4gICAgICAvXFx3KlxcLj9fX2V4dGVuZHNcXChcXHcrLCBfc3VwZXJcXCk7LyxcbiAgICBdLFxuICBdLm1hcChhcnIgPT4gbmV3IFJlZ0V4cChhcnIubWFwKHggPT4geC5zb3VyY2UpLmpvaW4oJycpLCAnbScpKTtcblxuICByZXR1cm4gcmVnZXhlcy5zb21lKChyZWdleCkgPT4gcmVnZXgudGVzdChjb250ZW50KSk7XG59XG5cbmNvbnN0IHN1cGVyUGFyYW1ldGVyTmFtZSA9ICdfc3VwZXInO1xuY29uc3QgZXh0ZW5kc0hlbHBlck5hbWUgPSAnX19leHRlbmRzJztcblxuZXhwb3J0IGZ1bmN0aW9uIGdldFByZWZpeENsYXNzZXNUcmFuc2Zvcm1lcigpOiB0cy5UcmFuc2Zvcm1lckZhY3Rvcnk8dHMuU291cmNlRmlsZT4ge1xuICByZXR1cm4gKGNvbnRleHQ6IHRzLlRyYW5zZm9ybWF0aW9uQ29udGV4dCk6IHRzLlRyYW5zZm9ybWVyPHRzLlNvdXJjZUZpbGU+ID0+IHtcbiAgICBjb25zdCB0cmFuc2Zvcm1lcjogdHMuVHJhbnNmb3JtZXI8dHMuU291cmNlRmlsZT4gPSAoc2Y6IHRzLlNvdXJjZUZpbGUpID0+IHtcblxuICAgICAgY29uc3QgcHVyZUZ1bmN0aW9uQ29tbWVudCA9ICdAX19QVVJFX18nO1xuXG4gICAgICBjb25zdCB2aXNpdG9yOiB0cy5WaXNpdG9yID0gKG5vZGU6IHRzLk5vZGUpOiB0cy5WaXNpdFJlc3VsdDx0cy5Ob2RlPiA9PiB7XG5cbiAgICAgICAgLy8gQWRkIHB1cmUgY29tbWVudCB0byBkb3dubGV2ZWxlZCBjbGFzc2VzLlxuICAgICAgICBpZiAodHMuaXNWYXJpYWJsZVN0YXRlbWVudChub2RlKSAmJiBpc0Rvd25sZXZlbGVkQ2xhc3Mobm9kZSkpIHtcbiAgICAgICAgICBjb25zdCB2YXJEZWNsID0gbm9kZS5kZWNsYXJhdGlvbkxpc3QuZGVjbGFyYXRpb25zWzBdO1xuICAgICAgICAgIGNvbnN0IHZhckluaXRpYWxpemVyID0gdmFyRGVjbC5pbml0aWFsaXplciBhcyB0cy5FeHByZXNzaW9uO1xuXG4gICAgICAgICAgLy8gVXBkYXRlIG5vZGUgd2l0aCB0aGUgcHVyZSBjb21tZW50IGJlZm9yZSB0aGUgdmFyaWFibGUgZGVjbGFyYXRpb24gaW5pdGlhbGl6ZXIuXG4gICAgICAgICAgY29uc3QgbmV3Tm9kZSA9IHRzLnVwZGF0ZVZhcmlhYmxlU3RhdGVtZW50KFxuICAgICAgICAgICAgbm9kZSxcbiAgICAgICAgICAgIG5vZGUubW9kaWZpZXJzLFxuICAgICAgICAgICAgdHMudXBkYXRlVmFyaWFibGVEZWNsYXJhdGlvbkxpc3QoXG4gICAgICAgICAgICAgIG5vZGUuZGVjbGFyYXRpb25MaXN0LFxuICAgICAgICAgICAgICBbXG4gICAgICAgICAgICAgICAgdHMudXBkYXRlVmFyaWFibGVEZWNsYXJhdGlvbihcbiAgICAgICAgICAgICAgICAgIHZhckRlY2wsXG4gICAgICAgICAgICAgICAgICB2YXJEZWNsLm5hbWUsXG4gICAgICAgICAgICAgICAgICB2YXJEZWNsLnR5cGUsXG4gICAgICAgICAgICAgICAgICB0cy5hZGRTeW50aGV0aWNMZWFkaW5nQ29tbWVudChcbiAgICAgICAgICAgICAgICAgICAgdmFySW5pdGlhbGl6ZXIsXG4gICAgICAgICAgICAgICAgICAgIHRzLlN5bnRheEtpbmQuTXVsdGlMaW5lQ29tbWVudFRyaXZpYSxcbiAgICAgICAgICAgICAgICAgICAgcHVyZUZ1bmN0aW9uQ29tbWVudCxcbiAgICAgICAgICAgICAgICAgICAgZmFsc2UsXG4gICAgICAgICAgICAgICAgICApLFxuICAgICAgICAgICAgICAgICksXG4gICAgICAgICAgICAgIF0sXG4gICAgICAgICAgICApLFxuICAgICAgICAgICk7XG5cbiAgICAgICAgICAvLyBSZXBsYWNlIG5vZGUgd2l0aCBtb2RpZmllZCBvbmUuXG4gICAgICAgICAgcmV0dXJuIHRzLnZpc2l0RWFjaENoaWxkKG5ld05vZGUsIHZpc2l0b3IsIGNvbnRleHQpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gT3RoZXJ3aXNlIHJldHVybiBub2RlIGFzIGlzLlxuICAgICAgICByZXR1cm4gdHMudmlzaXRFYWNoQ2hpbGQobm9kZSwgdmlzaXRvciwgY29udGV4dCk7XG4gICAgICB9O1xuXG4gICAgICByZXR1cm4gdHMudmlzaXRFYWNoQ2hpbGQoc2YsIHZpc2l0b3IsIGNvbnRleHQpO1xuICAgIH07XG5cbiAgICByZXR1cm4gdHJhbnNmb3JtZXI7XG4gIH07XG59XG5cbi8vIERldGVybWluZSBpZiBhIG5vZGUgbWF0Y2hlZCB0aGUgc3RydWN0dXJlIG9mIGEgZG93bmxldmVsZWQgVFMgY2xhc3MuXG5mdW5jdGlvbiBpc0Rvd25sZXZlbGVkQ2xhc3Mobm9kZTogdHMuTm9kZSk6IGJvb2xlYW4ge1xuXG4gIGlmICghdHMuaXNWYXJpYWJsZVN0YXRlbWVudChub2RlKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlmIChub2RlLmRlY2xhcmF0aW9uTGlzdC5kZWNsYXJhdGlvbnMubGVuZ3RoICE9PSAxKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3QgdmFyaWFibGVEZWNsYXJhdGlvbiA9IG5vZGUuZGVjbGFyYXRpb25MaXN0LmRlY2xhcmF0aW9uc1swXTtcblxuICBpZiAoIXRzLmlzSWRlbnRpZmllcih2YXJpYWJsZURlY2xhcmF0aW9uLm5hbWUpXG4gICAgICB8fCAhdmFyaWFibGVEZWNsYXJhdGlvbi5pbml0aWFsaXplcikge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGxldCBwb3RlbnRpYWxDbGFzcyA9IHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXI7XG5cbiAgLy8gVFMgMi4zIGhhcyBhbiB1bndyYXBwZWQgY2xhc3MgSUlGRVxuICAvLyBUUyAyLjQgdXNlcyBhIGZ1bmN0aW9uIGV4cHJlc3Npb24gd3JhcHBlclxuICAvLyBUUyAyLjUgdXNlcyBhbiBhcnJvdyBmdW5jdGlvbiB3cmFwcGVyXG4gIGlmICh0cy5pc1BhcmVudGhlc2l6ZWRFeHByZXNzaW9uKHBvdGVudGlhbENsYXNzKSkge1xuICAgIHBvdGVudGlhbENsYXNzID0gcG90ZW50aWFsQ2xhc3MuZXhwcmVzc2lvbjtcbiAgfVxuXG4gIGlmICghdHMuaXNDYWxsRXhwcmVzc2lvbihwb3RlbnRpYWxDbGFzcykgfHwgcG90ZW50aWFsQ2xhc3MuYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBsZXQgd3JhcHBlckJvZHk6IHRzLkJsb2NrO1xuICBpZiAodHMuaXNGdW5jdGlvbkV4cHJlc3Npb24ocG90ZW50aWFsQ2xhc3MuZXhwcmVzc2lvbikpIHtcbiAgICB3cmFwcGVyQm9keSA9IHBvdGVudGlhbENsYXNzLmV4cHJlc3Npb24uYm9keTtcbiAgfSBlbHNlIGlmICh0cy5pc0Fycm93RnVuY3Rpb24ocG90ZW50aWFsQ2xhc3MuZXhwcmVzc2lvbilcbiAgICAgICAgICAgICAmJiB0cy5pc0Jsb2NrKHBvdGVudGlhbENsYXNzLmV4cHJlc3Npb24uYm9keSkpIHtcbiAgICB3cmFwcGVyQm9keSA9IHBvdGVudGlhbENsYXNzLmV4cHJlc3Npb24uYm9keTtcbiAgfSBlbHNlIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAod3JhcHBlckJvZHkuc3RhdGVtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBjb25zdCBmdW5jdGlvbkV4cHJlc3Npb24gPSBwb3RlbnRpYWxDbGFzcy5leHByZXNzaW9uO1xuICBjb25zdCBmdW5jdGlvblN0YXRlbWVudHMgPSB3cmFwcGVyQm9keS5zdGF0ZW1lbnRzO1xuXG4gIC8vIG5lZWQgYSBtaW5pbXVtIG9mIHR3byBmb3IgYSBmdW5jdGlvbiBkZWNsYXJhdGlvbiBhbmQgcmV0dXJuIHN0YXRlbWVudFxuICBpZiAoZnVuY3Rpb25TdGF0ZW1lbnRzLmxlbmd0aCA8IDIpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBjb25zdCBmaXJzdFN0YXRlbWVudCA9IGZ1bmN0aW9uU3RhdGVtZW50c1swXTtcblxuICAvLyBmaW5kIHJldHVybiBzdGF0ZW1lbnQgLSBtYXkgbm90IGJlIGxhc3Qgc3RhdGVtZW50XG4gIGxldCByZXR1cm5TdGF0ZW1lbnQ6IHRzLlJldHVyblN0YXRlbWVudCB8IHVuZGVmaW5lZDtcbiAgZm9yIChsZXQgaSA9IGZ1bmN0aW9uU3RhdGVtZW50cy5sZW5ndGggLSAxOyBpID4gMDsgaS0tKSB7XG4gICAgaWYgKHRzLmlzUmV0dXJuU3RhdGVtZW50KGZ1bmN0aW9uU3RhdGVtZW50c1tpXSkpIHtcbiAgICAgIHJldHVyblN0YXRlbWVudCA9IGZ1bmN0aW9uU3RhdGVtZW50c1tpXSBhcyB0cy5SZXR1cm5TdGF0ZW1lbnQ7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICBpZiAocmV0dXJuU3RhdGVtZW50ID09IHVuZGVmaW5lZFxuICAgICAgfHwgcmV0dXJuU3RhdGVtZW50LmV4cHJlc3Npb24gPT0gdW5kZWZpbmVkXG4gICAgICB8fCAhdHMuaXNJZGVudGlmaWVyKHJldHVyblN0YXRlbWVudC5leHByZXNzaW9uKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGlmIChmdW5jdGlvbkV4cHJlc3Npb24ucGFyYW1ldGVycy5sZW5ndGggPT09IDApIHtcbiAgICAvLyBwb3RlbnRpYWwgbm9uLWV4dGVuZGVkIGNsYXNzIG9yIHdyYXBwZWQgZXMyMDE1IGNsYXNzXG4gICAgcmV0dXJuICh0cy5pc0Z1bmN0aW9uRGVjbGFyYXRpb24oZmlyc3RTdGF0ZW1lbnQpIHx8IHRzLmlzQ2xhc3NEZWNsYXJhdGlvbihmaXJzdFN0YXRlbWVudCkpXG4gICAgICAgICAgICYmIGZpcnN0U3RhdGVtZW50Lm5hbWUgIT09IHVuZGVmaW5lZFxuICAgICAgICAgICAmJiByZXR1cm5TdGF0ZW1lbnQuZXhwcmVzc2lvbi50ZXh0ID09PSBmaXJzdFN0YXRlbWVudC5uYW1lLnRleHQ7XG4gIH0gZWxzZSBpZiAoZnVuY3Rpb25FeHByZXNzaW9uLnBhcmFtZXRlcnMubGVuZ3RoICE9PSAxKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgLy8gUG90ZW50aWFsIGV4dGVuZGVkIGNsYXNzXG5cbiAgY29uc3QgZnVuY3Rpb25QYXJhbWV0ZXIgPSBmdW5jdGlvbkV4cHJlc3Npb24ucGFyYW1ldGVyc1swXTtcblxuICBpZiAoIXRzLmlzSWRlbnRpZmllcihmdW5jdGlvblBhcmFtZXRlci5uYW1lKVxuICAgICAgfHwgZnVuY3Rpb25QYXJhbWV0ZXIubmFtZS50ZXh0ICE9PSBzdXBlclBhcmFtZXRlck5hbWUpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAoZnVuY3Rpb25TdGF0ZW1lbnRzLmxlbmd0aCA8IDMgfHwgIXRzLmlzRXhwcmVzc2lvblN0YXRlbWVudChmaXJzdFN0YXRlbWVudCkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAoIXRzLmlzQ2FsbEV4cHJlc3Npb24oZmlyc3RTdGF0ZW1lbnQuZXhwcmVzc2lvbikpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBjb25zdCBleHRlbmRDYWxsRXhwcmVzc2lvbiA9IGZpcnN0U3RhdGVtZW50LmV4cHJlc3Npb247XG5cbiAgbGV0IGZ1bmN0aW9uTmFtZTtcbiAgaWYgKHRzLmlzSWRlbnRpZmllcihleHRlbmRDYWxsRXhwcmVzc2lvbi5leHByZXNzaW9uKSkge1xuICAgIGZ1bmN0aW9uTmFtZSA9IGV4dGVuZENhbGxFeHByZXNzaW9uLmV4cHJlc3Npb24udGV4dDtcbiAgfSBlbHNlIGlmICh0cy5pc1Byb3BlcnR5QWNjZXNzRXhwcmVzc2lvbihleHRlbmRDYWxsRXhwcmVzc2lvbi5leHByZXNzaW9uKSkge1xuICAgIGZ1bmN0aW9uTmFtZSA9IGV4dGVuZENhbGxFeHByZXNzaW9uLmV4cHJlc3Npb24ubmFtZS50ZXh0O1xuICB9XG5cbiAgaWYgKCFmdW5jdGlvbk5hbWUgfHwgIWZ1bmN0aW9uTmFtZS5lbmRzV2l0aChleHRlbmRzSGVscGVyTmFtZSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBpZiAoZXh0ZW5kQ2FsbEV4cHJlc3Npb24uYXJndW1lbnRzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIGNvbnN0IGxhc3RBcmd1bWVudCA9IGV4dGVuZENhbGxFeHByZXNzaW9uLmFyZ3VtZW50c1tleHRlbmRDYWxsRXhwcmVzc2lvbi5hcmd1bWVudHMubGVuZ3RoIC0gMV07XG5cbiAgaWYgKCF0cy5pc0lkZW50aWZpZXIobGFzdEFyZ3VtZW50KSB8fCBsYXN0QXJndW1lbnQudGV4dCAhPT0gZnVuY3Rpb25QYXJhbWV0ZXIubmFtZS50ZXh0KSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgY29uc3Qgc2Vjb25kU3RhdGVtZW50ID0gZnVuY3Rpb25TdGF0ZW1lbnRzWzFdO1xuXG4gIHJldHVybiB0cy5pc0Z1bmN0aW9uRGVjbGFyYXRpb24oc2Vjb25kU3RhdGVtZW50KVxuICAgICAgICAgJiYgc2Vjb25kU3RhdGVtZW50Lm5hbWUgIT09IHVuZGVmaW5lZFxuICAgICAgICAgJiYgcmV0dXJuU3RhdGVtZW50LmV4cHJlc3Npb24udGV4dCA9PT0gc2Vjb25kU3RhdGVtZW50Lm5hbWUudGV4dDtcbn1cbiJdfQ==