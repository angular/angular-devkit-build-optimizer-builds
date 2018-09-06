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
function isBlockLike(node) {
    return node.kind === ts.SyntaxKind.Block
        || node.kind === ts.SyntaxKind.ModuleBlock
        || node.kind === ts.SyntaxKind.CaseClause
        || node.kind === ts.SyntaxKind.DefaultClause
        || node.kind === ts.SyntaxKind.SourceFile;
}
function getWrapEnumsTransformer() {
    return (context) => {
        const transformer = (sf) => {
            const result = visitBlockStatements(sf.statements, context);
            return ts.updateSourceFileNode(sf, ts.setTextRange(result, sf.statements));
        };
        return transformer;
    };
}
exports.getWrapEnumsTransformer = getWrapEnumsTransformer;
function visitBlockStatements(statements, context) {
    // copy of statements to modify; lazy initialized
    let updatedStatements;
    const visitor = (node) => {
        if (isBlockLike(node)) {
            let result = visitBlockStatements(node.statements, context);
            if (result === node.statements) {
                return node;
            }
            result = ts.setTextRange(result, node.statements);
            switch (node.kind) {
                case ts.SyntaxKind.Block:
                    return ts.updateBlock(node, result);
                case ts.SyntaxKind.ModuleBlock:
                    return ts.updateModuleBlock(node, result);
                case ts.SyntaxKind.CaseClause:
                    const clause = node;
                    return ts.updateCaseClause(clause, clause.expression, result);
                case ts.SyntaxKind.DefaultClause:
                    return ts.updateDefaultClause(node, result);
                default:
                    return node;
            }
        }
        else {
            return ts.visitEachChild(node, visitor, context);
        }
    };
    // 'oIndex' is the original statement index; 'uIndex' is the updated statement index
    for (let oIndex = 0, uIndex = 0; oIndex < statements.length; oIndex++, uIndex++) {
        const currentStatement = statements[oIndex];
        // these can't contain an enum declaration
        if (currentStatement.kind === ts.SyntaxKind.ImportDeclaration) {
            continue;
        }
        // enum declarations must:
        //   * not be last statement
        //   * be a variable statement
        //   * have only one declaration
        //   * have an identifer as a declaration name
        if (oIndex < statements.length - 1
            && ts.isVariableStatement(currentStatement)
            && currentStatement.declarationList.declarations.length === 1) {
            const variableDeclaration = currentStatement.declarationList.declarations[0];
            if (ts.isIdentifier(variableDeclaration.name)) {
                const name = variableDeclaration.name.text;
                if (!variableDeclaration.initializer) {
                    const iife = findTs2_3EnumIife(name, statements[oIndex + 1]);
                    if (iife) {
                        // found an enum
                        if (!updatedStatements) {
                            updatedStatements = statements.slice();
                        }
                        // update IIFE and replace variable statement and old IIFE
                        updatedStatements.splice(uIndex, 2, updateEnumIife(currentStatement, iife[0], iife[1]));
                        // skip IIFE statement
                        oIndex++;
                        continue;
                    }
                }
                else if (ts.isObjectLiteralExpression(variableDeclaration.initializer)
                    && variableDeclaration.initializer.properties.length === 0) {
                    const enumStatements = findTs2_2EnumStatements(name, statements, oIndex + 1);
                    if (enumStatements.length > 0) {
                        // found an enum
                        if (!updatedStatements) {
                            updatedStatements = statements.slice();
                        }
                        // create wrapper and replace variable statement and enum member statements
                        updatedStatements.splice(uIndex, enumStatements.length + 1, createWrappedEnum(name, currentStatement, enumStatements, variableDeclaration.initializer));
                        // skip enum member declarations
                        oIndex += enumStatements.length;
                        continue;
                    }
                }
                else if (ts.isObjectLiteralExpression(variableDeclaration.initializer)
                    && variableDeclaration.initializer.properties.length !== 0) {
                    const literalPropertyCount = variableDeclaration.initializer.properties.length;
                    const enumStatements = findEnumNameStatements(name, statements, oIndex + 1);
                    if (enumStatements.length === literalPropertyCount) {
                        // found an enum
                        if (!updatedStatements) {
                            updatedStatements = statements.slice();
                        }
                        // create wrapper and replace variable statement and enum member statements
                        updatedStatements.splice(uIndex, enumStatements.length + 1, createWrappedEnum(name, currentStatement, enumStatements, variableDeclaration.initializer));
                        // skip enum member declarations
                        oIndex += enumStatements.length;
                        continue;
                    }
                }
            }
        }
        const result = ts.visitNode(currentStatement, visitor);
        if (result !== currentStatement) {
            if (!updatedStatements) {
                updatedStatements = statements.slice();
            }
            updatedStatements[uIndex] = result;
        }
    }
    // if changes, return updated statements
    // otherwise, return original array instance
    return updatedStatements ? ts.createNodeArray(updatedStatements) : statements;
}
// TS 2.3 enums have statements that are inside a IIFE.
function findTs2_3EnumIife(name, statement) {
    if (!ts.isExpressionStatement(statement)) {
        return null;
    }
    let expression = statement.expression;
    while (ts.isParenthesizedExpression(expression)) {
        expression = expression.expression;
    }
    if (!expression || !ts.isCallExpression(expression) || expression.arguments.length !== 1) {
        return null;
    }
    const callExpression = expression;
    let exportExpression;
    let argument = expression.arguments[0];
    if (!ts.isBinaryExpression(argument)) {
        return null;
    }
    if (!ts.isIdentifier(argument.left) || argument.left.text !== name) {
        return null;
    }
    let potentialExport = false;
    if (argument.operatorToken.kind === ts.SyntaxKind.FirstAssignment) {
        if (!ts.isBinaryExpression(argument.right)
            || argument.right.operatorToken.kind !== ts.SyntaxKind.BarBarToken) {
            return null;
        }
        potentialExport = true;
        argument = argument.right;
    }
    if (!ts.isBinaryExpression(argument)) {
        return null;
    }
    if (argument.operatorToken.kind !== ts.SyntaxKind.BarBarToken) {
        return null;
    }
    if (potentialExport && !ts.isIdentifier(argument.left)) {
        exportExpression = argument.left;
    }
    expression = expression.expression;
    while (ts.isParenthesizedExpression(expression)) {
        expression = expression.expression;
    }
    if (!expression || !ts.isFunctionExpression(expression) || expression.parameters.length !== 1) {
        return null;
    }
    const parameter = expression.parameters[0];
    if (!ts.isIdentifier(parameter.name)) {
        return null;
    }
    // The name of the parameter can be different than the name of the enum if it was renamed
    // due to scope hoisting.
    const parameterName = parameter.name.text;
    // In TS 2.3 enums, the IIFE contains only expressions with a certain format.
    // If we find any that is different, we ignore the whole thing.
    for (let bodyIndex = 0; bodyIndex < expression.body.statements.length; ++bodyIndex) {
        const bodyStatement = expression.body.statements[bodyIndex];
        if (!ts.isExpressionStatement(bodyStatement) || !bodyStatement.expression) {
            return null;
        }
        if (!ts.isBinaryExpression(bodyStatement.expression)
            || bodyStatement.expression.operatorToken.kind !== ts.SyntaxKind.FirstAssignment) {
            return null;
        }
        const assignment = bodyStatement.expression.left;
        const value = bodyStatement.expression.right;
        if (!ts.isElementAccessExpression(assignment) || !ts.isStringLiteral(value)) {
            return null;
        }
        if (!ts.isIdentifier(assignment.expression) || assignment.expression.text !== parameterName) {
            return null;
        }
        const memberArgument = assignment.argumentExpression;
        if (!memberArgument || !ts.isBinaryExpression(memberArgument)
            || memberArgument.operatorToken.kind !== ts.SyntaxKind.FirstAssignment) {
            return null;
        }
        if (!ts.isElementAccessExpression(memberArgument.left)) {
            return null;
        }
        if (!ts.isIdentifier(memberArgument.left.expression)
            || memberArgument.left.expression.text !== parameterName) {
            return null;
        }
        if (!memberArgument.left.argumentExpression
            || !ts.isStringLiteral(memberArgument.left.argumentExpression)) {
            return null;
        }
        if (memberArgument.left.argumentExpression.text !== value.text) {
            return null;
        }
    }
    return [callExpression, exportExpression];
}
// TS 2.2 enums have statements after the variable declaration, with index statements followed
// by value statements.
function findTs2_2EnumStatements(name, statements, statementOffset) {
    const enumValueStatements = [];
    const memberNames = [];
    let index = statementOffset;
    for (; index < statements.length; ++index) {
        // Ensure all statements are of the expected format and using the right identifer.
        // When we find a statement that isn't part of the enum, return what we collected so far.
        const current = statements[index];
        if (!ts.isExpressionStatement(current) || !ts.isBinaryExpression(current.expression)) {
            break;
        }
        const property = current.expression.left;
        if (!property || !ts.isPropertyAccessExpression(property)) {
            break;
        }
        if (!ts.isIdentifier(property.expression) || property.expression.text !== name) {
            break;
        }
        memberNames.push(property.name.text);
        enumValueStatements.push(current);
    }
    if (enumValueStatements.length === 0) {
        return [];
    }
    const enumNameStatements = findEnumNameStatements(name, statements, index, memberNames);
    if (enumNameStatements.length !== enumValueStatements.length) {
        return [];
    }
    return enumValueStatements.concat(enumNameStatements);
}
// Tsickle enums have a variable statement with indexes, followed by value statements.
// See https://github.com/angular/devkit/issues/229#issuecomment-338512056 fore more information.
function findEnumNameStatements(name, statements, statementOffset, memberNames) {
    const enumStatements = [];
    for (let index = statementOffset; index < statements.length; ++index) {
        // Ensure all statements are of the expected format and using the right identifer.
        // When we find a statement that isn't part of the enum, return what we collected so far.
        const current = statements[index];
        if (!ts.isExpressionStatement(current) || !ts.isBinaryExpression(current.expression)) {
            break;
        }
        const access = current.expression.left;
        const value = current.expression.right;
        if (!access || !ts.isElementAccessExpression(access) || !value || !ts.isStringLiteral(value)) {
            break;
        }
        if (memberNames && !memberNames.includes(value.text)) {
            break;
        }
        if (!ts.isIdentifier(access.expression) || access.expression.text !== name) {
            break;
        }
        if (!access.argumentExpression || !ts.isPropertyAccessExpression(access.argumentExpression)) {
            break;
        }
        const enumExpression = access.argumentExpression.expression;
        if (!ts.isIdentifier(enumExpression) || enumExpression.text !== name) {
            break;
        }
        if (value.text !== access.argumentExpression.name.text) {
            break;
        }
        enumStatements.push(current);
    }
    return enumStatements;
}
function addPureComment(node) {
    const pureFunctionComment = '@__PURE__';
    return ts.addSyntheticLeadingComment(node, ts.SyntaxKind.MultiLineCommentTrivia, pureFunctionComment, false);
}
function updateHostNode(hostNode, expression) {
    // Update existing host node with the pure comment before the variable declaration initializer.
    const variableDeclaration = hostNode.declarationList.declarations[0];
    const outerVarStmt = ts.updateVariableStatement(hostNode, hostNode.modifiers, ts.updateVariableDeclarationList(hostNode.declarationList, [
        ts.updateVariableDeclaration(variableDeclaration, variableDeclaration.name, variableDeclaration.type, expression),
    ]));
    return outerVarStmt;
}
function updateEnumIife(hostNode, iife, exportAssignment) {
    if (!ts.isParenthesizedExpression(iife.expression)
        || !ts.isFunctionExpression(iife.expression.expression)) {
        throw new Error('Invalid IIFE Structure');
    }
    // Ignore export assignment if variable is directly exported
    if (hostNode.modifiers
        && hostNode.modifiers.findIndex(m => m.kind == ts.SyntaxKind.ExportKeyword) != -1) {
        exportAssignment = undefined;
    }
    const expression = iife.expression.expression;
    const updatedFunction = ts.updateFunctionExpression(expression, expression.modifiers, expression.asteriskToken, expression.name, expression.typeParameters, expression.parameters, expression.type, ts.updateBlock(expression.body, [
        ...expression.body.statements,
        ts.createReturn(expression.parameters[0].name),
    ]));
    let arg = ts.createObjectLiteral();
    if (exportAssignment) {
        arg = ts.createBinary(exportAssignment, ts.SyntaxKind.BarBarToken, arg);
    }
    const updatedIife = ts.updateCall(iife, ts.updateParen(iife.expression, updatedFunction), iife.typeArguments, [arg]);
    let value = addPureComment(updatedIife);
    if (exportAssignment) {
        value = ts.createBinary(exportAssignment, ts.SyntaxKind.FirstAssignment, updatedIife);
    }
    return updateHostNode(hostNode, value);
}
function createWrappedEnum(name, hostNode, statements, literalInitializer) {
    literalInitializer = literalInitializer || ts.createObjectLiteral();
    const innerVarStmt = ts.createVariableStatement(undefined, ts.createVariableDeclarationList([
        ts.createVariableDeclaration(name, undefined, literalInitializer),
    ]));
    const innerReturn = ts.createReturn(ts.createIdentifier(name));
    const iife = ts.createImmediatelyInvokedFunctionExpression([
        innerVarStmt,
        ...statements,
        innerReturn,
    ]);
    return updateHostNode(hostNode, addPureComment(ts.createParen(iife)));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid3JhcC1lbnVtcy5qcyIsInNvdXJjZVJvb3QiOiIuLyIsInNvdXJjZXMiOlsicGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYnVpbGRfb3B0aW1pemVyL3NyYy90cmFuc2Zvcm1zL3dyYXAtZW51bXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7Ozs7O0dBTUc7QUFDSCxpQ0FBaUM7QUFFakMscUJBQXFCLElBQWE7SUFDaEMsT0FBTyxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsS0FBSztXQUNqQyxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsV0FBVztXQUN2QyxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsVUFBVTtXQUN0QyxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsYUFBYTtXQUN6QyxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDO0FBQ2hELENBQUM7QUFFRDtJQUNFLE9BQU8sQ0FBQyxPQUFpQyxFQUFpQyxFQUFFO1FBQzFFLE1BQU0sV0FBVyxHQUFrQyxDQUFDLEVBQWlCLEVBQUUsRUFBRTtZQUV2RSxNQUFNLE1BQU0sR0FBRyxvQkFBb0IsQ0FBQyxFQUFFLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxDQUFDO1lBRTVELE9BQU8sRUFBRSxDQUFDLG9CQUFvQixDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUM3RSxDQUFDLENBQUM7UUFFRixPQUFPLFdBQVcsQ0FBQztJQUNyQixDQUFDLENBQUM7QUFDSixDQUFDO0FBWEQsMERBV0M7QUFFRCw4QkFDRSxVQUFzQyxFQUN0QyxPQUFpQztJQUdqQyxpREFBaUQ7SUFDakQsSUFBSSxpQkFBa0QsQ0FBQztJQUV2RCxNQUFNLE9BQU8sR0FBZSxDQUFDLElB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Q0FDTixDQUFDO0lBRUYsSUFBSSxLQUFLLEdBQWtCLGNBQWMsQ0FBQyxXQUFXLENBQUMsQ0FBQztJQUN2RCxJQUFJLGdCQUFnQixFQUFFO1FBQ3BCLEtBQUssR0FBRyxFQUFFLENBQUMsWUFBWSxDQUNyQixnQkFBZ0IsRUFDaEIsRUFBRSxDQUFDLFVBQVUsQ0FBQyxlQUFlLEVBQzdCLFdBQVcsQ0FBQyxDQUFDO0tBQ2hCO0lBRUQsT0FBTyxjQUFjLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQ3pDLENBQUM7QUFFRCwyQkFDRSxJQUFZLEVBQ1osUUFBOEIsRUFDOUIsVUFBK0IsRUFDL0Isa0JBQTBEO0lBRTFELGtCQUFrQixHQUFHLGtCQUFrQixJQUFJLEVBQUUsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO0lBQ3BFLE1BQU0sWUFBWSxHQUFHLEVBQUUsQ0FBQyx1QkFBdUIsQ0FDN0MsU0FBUyxFQUNULEVBQUUsQ0FBQyw2QkFBNkIsQ0FBQztRQUMvQixFQUFFLENBQUMseUJBQXlCLENBQUMsSUFBSSxFQUFFLFNBQVMsRUFBRSxrQkFBa0IsQ0FBQztLQUNsRSxDQUFDLENBQ0gsQ0FBQztJQUVGLE1BQU0sV0FBVyxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsRUFBRSxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7SUFFL0QsTUFBTSxJQUFJLEdBQUcsRUFBRSxDQUFDLDBDQUEwQyxDQUFDO1FBQ3pELFlBQVk7UUFDWixHQUFHLFVBQVU7UUFDYixXQUFXO0tBQ1osQ0FBQyxDQUFDO0lBRUgsT0FBTyxjQUFjLENBQUMsUUFBUSxFQUFFLGNBQWMsQ0FBQyxFQUFFLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztBQUN4RSxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBJbmMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuaW1wb3J0ICogYXMgdHMgZnJvbSAndHlwZXNjcmlwdCc7XG5cbmZ1bmN0aW9uIGlzQmxvY2tMaWtlKG5vZGU6IHRzLk5vZGUpOiBub2RlIGlzIHRzLkJsb2NrTGlrZSB7XG4gIHJldHVybiBub2RlLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuQmxvY2tcbiAgICAgIHx8IG5vZGUua2luZCA9PT0gdHMuU3ludGF4S2luZC5Nb2R1bGVCbG9ja1xuICAgICAgfHwgbm9kZS5raW5kID09PSB0cy5TeW50YXhLaW5kLkNhc2VDbGF1c2VcbiAgICAgIHx8IG5vZGUua2luZCA9PT0gdHMuU3ludGF4S2luZC5EZWZhdWx0Q2xhdXNlXG4gICAgICB8fCBub2RlLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuU291cmNlRmlsZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFdyYXBFbnVtc1RyYW5zZm9ybWVyKCk6IHRzLlRyYW5zZm9ybWVyRmFjdG9yeTx0cy5Tb3VyY2VGaWxlPiB7XG4gIHJldHVybiAoY29udGV4dDogdHMuVHJhbnNmb3JtYXRpb25Db250ZXh0KTogdHMuVHJhbnNmb3JtZXI8dHMuU291cmNlRmlsZT4gPT4ge1xuICAgIGNvbnN0IHRyYW5zZm9ybWVyOiB0cy5UcmFuc2Zvcm1lcjx0cy5Tb3VyY2VGaWxlPiA9IChzZjogdHMuU291cmNlRmlsZSkgPT4ge1xuXG4gICAgICBjb25zdCByZXN1bHQgPSB2aXNpdEJsb2NrU3RhdGVtZW50cyhzZi5zdGF0ZW1lbnRzLCBjb250ZXh0KTtcblxuICAgICAgcmV0dXJuIHRzLnVwZGF0ZVNvdXJjZUZpbGVOb2RlKHNmLCB0cy5zZXRUZXh0UmFuZ2UocmVzdWx0LCBzZi5zdGF0ZW1lbnRzKSk7XG4gICAgfTtcblxuICAgIHJldHVybiB0cmFuc2Zvcm1lcjtcbiAgfTtcbn1cblxuZnVuY3Rpb24gdmlzaXRCbG9ja1N0YXRlbWVudHMoXG4gIHN0YXRlbWVudHM6IHRzLk5vZGVBcnJheTx0cy5TdGF0ZW1lbnQ+LFxuICBjb250ZXh0OiB0cy5UcmFuc2Zvcm1hdGlvbkNvbnRleHQsXG4pOiB0cy5Ob2RlQXJyYXk8dHMuU3RhdGVtZW50PiB7XG5cbiAgLy8gY29weSBvZiBzdGF0ZW1lbnRzIHRvIG1vZGlmeTsgbGF6eSBpbml0aWFsaXplZFxuICBsZXQgdXBkYXRlZFN0YXRlbWVudHM6IEFycmF5PHRzLlN0YXRlbWVudD4gfCB1bmRlZmluZWQ7XG5cbiAgY29uc3QgdmlzaXRvcjogdHMuVmlzaXRvciA9IChub2RlKSA9PiB7XG4gICAgaWYgKGlzQmxvY2tMaWtlKG5vZGUpKSB7XG4gICAgICBsZXQgcmVzdWx0ID0gdmlzaXRCbG9ja1N0YXRlbWVudHMobm9kZS5zdGF0ZW1lbnRzLCBjb250ZXh0KTtcbiAgICAgIGlmIChyZXN1bHQgPT09IG5vZGUuc3RhdGVtZW50cykge1xuICAgICAgICByZXR1cm4gbm9kZTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IHRzLnNldFRleHRSYW5nZShyZXN1bHQsIG5vZGUuc3RhdGVtZW50cyk7XG4gICAgICBzd2l0Y2ggKG5vZGUua2luZCkge1xuICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuQmxvY2s6XG4gICAgICAgICAgcmV0dXJuIHRzLnVwZGF0ZUJsb2NrKG5vZGUgYXMgdHMuQmxvY2ssIHJlc3VsdCk7XG4gICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5Nb2R1bGVCbG9jazpcbiAgICAgICAgICByZXR1cm4gdHMudXBkYXRlTW9kdWxlQmxvY2sobm9kZSBhcyB0cy5Nb2R1bGVCbG9jaywgcmVzdWx0KTtcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkNhc2VDbGF1c2U6XG4gICAgICAgICAgY29uc3QgY2xhdXNlID0gbm9kZSBhcyB0cy5DYXNlQ2xhdXNlO1xuXG4gICAgICAgICAgcmV0dXJuIHRzLnVwZGF0ZUNhc2VDbGF1c2UoY2xhdXNlLCBjbGF1c2UuZXhwcmVzc2lvbiwgcmVzdWx0KTtcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkRlZmF1bHRDbGF1c2U6XG4gICAgICAgICAgcmV0dXJuIHRzLnVwZGF0ZURlZmF1bHRDbGF1c2Uobm9kZSBhcyB0cy5EZWZhdWx0Q2xhdXNlLCByZXN1bHQpO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHJldHVybiBub2RlO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdHMudmlzaXRFYWNoQ2hpbGQobm9kZSwgdmlzaXRvciwgY29udGV4dCk7XG4gICAgfVxuICB9O1xuXG4gIC8vICdvSW5kZXgnIGlzIHRoZSBvcmlnaW5hbCBzdGF0ZW1lbnQgaW5kZXg7ICd1SW5kZXgnIGlzIHRoZSB1cGRhdGVkIHN0YXRlbWVudCBpbmRleFxuICBmb3IgKGxldCBvSW5kZXggPSAwLCB1SW5kZXggPSAwOyBvSW5kZXggPCBzdGF0ZW1lbnRzLmxlbmd0aDsgb0luZGV4KyssIHVJbmRleCsrKSB7XG4gICAgY29uc3QgY3VycmVudFN0YXRlbWVudCA9IHN0YXRlbWVudHNbb0luZGV4XTtcblxuICAgIC8vIHRoZXNlIGNhbid0IGNvbnRhaW4gYW4gZW51bSBkZWNsYXJhdGlvblxuICAgIGlmIChjdXJyZW50U3RhdGVtZW50LmtpbmQgPT09IHRzLlN5bnRheEtpbmQuSW1wb3J0RGVjbGFyYXRpb24pIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIGVudW0gZGVjbGFyYXRpb25zIG11c3Q6XG4gICAgLy8gICAqIG5vdCBiZSBsYXN0IHN0YXRlbWVudFxuICAgIC8vICAgKiBiZSBhIHZhcmlhYmxlIHN0YXRlbWVudFxuICAgIC8vICAgKiBoYXZlIG9ubHkgb25lIGRlY2xhcmF0aW9uXG4gICAgLy8gICAqIGhhdmUgYW4gaWRlbnRpZmVyIGFzIGEgZGVjbGFyYXRpb24gbmFtZVxuICAgIGlmIChvSW5kZXggPCBzdGF0ZW1lbnRzLmxlbmd0aCAtIDFcbiAgICAgICAgJiYgdHMuaXNWYXJpYWJsZVN0YXRlbWVudChjdXJyZW50U3RhdGVtZW50KVxuICAgICAgICAmJiBjdXJyZW50U3RhdGVtZW50LmRlY2xhcmF0aW9uTGlzdC5kZWNsYXJhdGlvbnMubGVuZ3RoID09PSAxKSB7XG5cbiAgICAgIGNvbnN0IHZhcmlhYmxlRGVjbGFyYXRpb24gPSBjdXJyZW50U3RhdGVtZW50LmRlY2xhcmF0aW9uTGlzdC5kZWNsYXJhdGlvbnNbMF07XG4gICAgICBpZiAodHMuaXNJZGVudGlmaWVyKHZhcmlhYmxlRGVjbGFyYXRpb24ubmFtZSkpIHtcbiAgICAgICAgY29uc3QgbmFtZSA9IHZhcmlhYmxlRGVjbGFyYXRpb24ubmFtZS50ZXh0O1xuXG4gICAgICAgIGlmICghdmFyaWFibGVEZWNsYXJhdGlvbi5pbml0aWFsaXplcikge1xuICAgICAgICAgIGNvbnN0IGlpZmUgPSBmaW5kVHMyXzNFbnVtSWlmZShuYW1lLCBzdGF0ZW1lbnRzW29JbmRleCArIDFdKTtcbiAgICAgICAgICBpZiAoaWlmZSkge1xuICAgICAgICAgICAgLy8gZm91bmQgYW4gZW51bVxuICAgICAgICAgICAgaWYgKCF1cGRhdGVkU3RhdGVtZW50cykge1xuICAgICAgICAgICAgICB1cGRhdGVkU3RhdGVtZW50cyA9IHN0YXRlbWVudHMuc2xpY2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHVwZGF0ZSBJSUZFIGFuZCByZXBsYWNlIHZhcmlhYmxlIHN0YXRlbWVudCBhbmQgb2xkIElJRkVcbiAgICAgICAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzLnNwbGljZSh1SW5kZXgsIDIsIHVwZGF0ZUVudW1JaWZlKFxuICAgICAgICAgICAgICBjdXJyZW50U3RhdGVtZW50LFxuICAgICAgICAgICAgICBpaWZlWzBdLFxuICAgICAgICAgICAgICBpaWZlWzFdLFxuICAgICAgICAgICAgKSk7XG4gICAgICAgICAgICAvLyBza2lwIElJRkUgc3RhdGVtZW50XG4gICAgICAgICAgICBvSW5kZXgrKztcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICh0cy5pc09iamVjdExpdGVyYWxFeHByZXNzaW9uKHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIpXG4gICAgICAgICAgICAgICAgICAgJiYgdmFyaWFibGVEZWNsYXJhdGlvbi5pbml0aWFsaXplci5wcm9wZXJ0aWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnN0IGVudW1TdGF0ZW1lbnRzID0gZmluZFRzMl8yRW51bVN0YXRlbWVudHMobmFtZSwgc3RhdGVtZW50cywgb0luZGV4ICsgMSk7XG4gICAgICAgICAgaWYgKGVudW1TdGF0ZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vIGZvdW5kIGFuIGVudW1cbiAgICAgICAgICAgIGlmICghdXBkYXRlZFN0YXRlbWVudHMpIHtcbiAgICAgICAgICAgICAgdXBkYXRlZFN0YXRlbWVudHMgPSBzdGF0ZW1lbnRzLnNsaWNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBjcmVhdGUgd3JhcHBlciBhbmQgcmVwbGFjZSB2YXJpYWJsZSBzdGF0ZW1lbnQgYW5kIGVudW0gbWVtYmVyIHN0YXRlbWVudHNcbiAgICAgICAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzLnNwbGljZSh1SW5kZXgsIGVudW1TdGF0ZW1lbnRzLmxlbmd0aCArIDEsIGNyZWF0ZVdyYXBwZWRFbnVtKFxuICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICBjdXJyZW50U3RhdGVtZW50LFxuICAgICAgICAgICAgICBlbnVtU3RhdGVtZW50cyxcbiAgICAgICAgICAgICAgdmFyaWFibGVEZWNsYXJhdGlvbi5pbml0aWFsaXplcixcbiAgICAgICAgICAgICkpO1xuICAgICAgICAgICAgLy8gc2tpcCBlbnVtIG1lbWJlciBkZWNsYXJhdGlvbnNcbiAgICAgICAgICAgIG9JbmRleCArPSBlbnVtU3RhdGVtZW50cy5sZW5ndGg7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodHMuaXNPYmplY3RMaXRlcmFsRXhwcmVzc2lvbih2YXJpYWJsZURlY2xhcmF0aW9uLmluaXRpYWxpemVyKVxuICAgICAgICAgICYmIHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIucHJvcGVydGllcy5sZW5ndGggIT09IDApIHtcbiAgICAgICAgICBjb25zdCBsaXRlcmFsUHJvcGVydHlDb3VudCA9IHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIucHJvcGVydGllcy5sZW5ndGg7XG4gICAgICAgICAgY29uc3QgZW51bVN0YXRlbWVudHMgPSBmaW5kRW51bU5hbWVTdGF0ZW1lbnRzKG5hbWUsIHN0YXRlbWVudHMsIG9JbmRleCArIDEpO1xuICAgICAgICAgIGlmIChlbnVtU3RhdGVtZW50cy5sZW5ndGggPT09IGxpdGVyYWxQcm9wZXJ0eUNvdW50KSB7XG4gICAgICAgICAgICAvLyBmb3VuZCBhbiBlbnVtXG4gICAgICAgICAgICBpZiAoIXVwZGF0ZWRTdGF0ZW1lbnRzKSB7XG4gICAgICAgICAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzID0gc3RhdGVtZW50cy5zbGljZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gY3JlYXRlIHdyYXBwZXIgYW5kIHJlcGxhY2UgdmFyaWFibGUgc3RhdGVtZW50IGFuZCBlbnVtIG1lbWJlciBzdGF0ZW1lbnRzXG4gICAgICAgICAgICB1cGRhdGVkU3RhdGVtZW50cy5zcGxpY2UodUluZGV4LCBlbnVtU3RhdGVtZW50cy5sZW5ndGggKyAxLCBjcmVhdGVXcmFwcGVkRW51bShcbiAgICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgICAgY3VycmVudFN0YXRlbWVudCxcbiAgICAgICAgICAgICAgZW51bVN0YXRlbWVudHMsXG4gICAgICAgICAgICAgIHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIsXG4gICAgICAgICAgICApKTtcbiAgICAgICAgICAgIC8vIHNraXAgZW51bSBtZW1iZXIgZGVjbGFyYXRpb25zXG4gICAgICAgICAgICBvSW5kZXggKz0gZW51bVN0YXRlbWVudHMubGVuZ3RoO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0ID0gdHMudmlzaXROb2RlKGN1cnJlbnRTdGF0ZW1lbnQsIHZpc2l0b3IpO1xuICAgIGlmIChyZXN1bHQgIT09IGN1cnJlbnRTdGF0ZW1lbnQpIHtcbiAgICAgIGlmICghdXBkYXRlZFN0YXRlbWVudHMpIHtcbiAgICAgICAgdXBkYXRlZFN0YXRlbWVudHMgPSBzdGF0ZW1lbnRzLnNsaWNlKCk7XG4gICAgICB9XG4gICAgICB1cGRhdGVkU3RhdGVtZW50c1t1SW5kZXhdID0gcmVzdWx0O1xuICAgIH1cbiAgfVxuXG4gIC8vIGlmIGNoYW5nZXMsIHJldHVybiB1cGRhdGVkIHN0YXRlbWVudHNcbiAgLy8gb3RoZXJ3aXNlLCByZXR1cm4gb3JpZ2luYWwgYXJyYXkgaW5zdGFuY2VcbiAgcmV0dXJuIHVwZGF0ZWRTdGF0ZW1lbnRzID8gdHMuY3JlYXRlTm9kZUFycmF5KHVwZGF0ZWRTdGF0ZW1lbnRzKSA6IHN0YXRlbWVudHM7XG59XG5cbi8vIFRTIDIuMyBlbnVtcyBoYXZlIHN0YXRlbWVudHMgdGhhdCBhcmUgaW5zaWRlIGEgSUlGRS5cbmZ1bmN0aW9uIGZpbmRUczJfM0VudW1JaWZlKFxuICBuYW1lOiBzdHJpbmcsXG4gIHN0YXRlbWVudDogdHMuU3RhdGVtZW50LFxuKTogW3RzLkNhbGxFeHByZXNzaW9uLCB0cy5FeHByZXNzaW9uIHwgdW5kZWZpbmVkXSB8IG51bGwge1xuICBpZiAoIXRzLmlzRXhwcmVzc2lvblN0YXRlbWVudChzdGF0ZW1lbnQpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBsZXQgZXhwcmVzc2lvbiA9IHN0YXRlbWVudC5leHByZXNzaW9uO1xuICB3aGlsZSAodHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbihleHByZXNzaW9uKSkge1xuICAgIGV4cHJlc3Npb24gPSBleHByZXNzaW9uLmV4cHJlc3Npb247XG4gIH1cblxuICBpZiAoIWV4cHJlc3Npb24gfHwgIXRzLmlzQ2FsbEV4cHJlc3Npb24oZXhwcmVzc2lvbikgfHwgZXhwcmVzc2lvbi5hcmd1bWVudHMubGVuZ3RoICE9PSAxKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCBjYWxsRXhwcmVzc2lvbiA9IGV4cHJlc3Npb247XG4gIGxldCBleHBvcnRFeHByZXNzaW9uO1xuXG4gIGxldCBhcmd1bWVudCA9IGV4cHJlc3Npb24uYXJndW1lbnRzWzBdO1xuICBpZiAoIXRzLmlzQmluYXJ5RXhwcmVzc2lvbihhcmd1bWVudCkpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGlmICghdHMuaXNJZGVudGlmaWVyKGFyZ3VtZW50LmxlZnQpIHx8IGFyZ3VtZW50LmxlZnQudGV4dCAhPT0gbmFtZSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgbGV0IHBvdGVudGlhbEV4cG9ydCA9IGZhbHNlO1xuICBpZiAoYXJndW1lbnQub3BlcmF0b3JUb2tlbi5raW5kID09PSB0cy5TeW50YXhLaW5kLkZpcnN0QXNzaWdubWVudCkge1xuICAgIGlmICghdHMuaXNCaW5hcnlFeHByZXNzaW9uKGFyZ3VtZW50LnJpZ2h0KVxuICAgICAgICB8fCBhcmd1bWVudC5yaWdodC5vcGVyYXRvclRva2VuLmtpbmQgIT09IHRzLlN5bnRheEtpbmQuQmFyQmFyVG9rZW4pIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHBvdGVudGlhbEV4cG9ydCA9IHRydWU7XG4gICAgYXJndW1lbnQgPSBhcmd1bWVudC5yaWdodDtcbiAgfVxuXG4gIGlmICghdHMuaXNCaW5hcnlFeHByZXNzaW9uKGFyZ3VtZW50KSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgaWYgKGFyZ3VtZW50Lm9wZXJhdG9yVG9rZW4ua2luZCAhPT0gdHMuU3ludGF4S2luZC5CYXJCYXJUb2tlbikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgaWYgKHBvdGVudGlhbEV4cG9ydCAmJiAhdHMuaXNJZGVudGlmaWVyKGFyZ3VtZW50LmxlZnQpKSB7XG4gICAgZXhwb3J0RXhwcmVzc2lvbiA9IGFyZ3VtZW50LmxlZnQ7XG4gIH1cblxuICBleHByZXNzaW9uID0gZXhwcmVzc2lvbi5leHByZXNzaW9uO1xuICB3aGlsZSAodHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbihleHByZXNzaW9uKSkge1xuICAgIGV4cHJlc3Npb24gPSBleHByZXNzaW9uLmV4cHJlc3Npb247XG4gIH1cblxuICBpZiAoIWV4cHJlc3Npb24gfHwgIXRzLmlzRnVuY3Rpb25FeHByZXNzaW9uKGV4cHJlc3Npb24pIHx8IGV4cHJlc3Npb24ucGFyYW1ldGVycy5sZW5ndGggIT09IDEpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGNvbnN0IHBhcmFtZXRlciA9IGV4cHJlc3Npb24ucGFyYW1ldGVyc1swXTtcbiAgaWYgKCF0cy5pc0lkZW50aWZpZXIocGFyYW1ldGVyLm5hbWUpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvLyBUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyIGNhbiBiZSBkaWZmZXJlbnQgdGhhbiB0aGUgbmFtZSBvZiB0aGUgZW51bSBpZiBpdCB3YXMgcmVuYW1lZFxuICAvLyBkdWUgdG8gc2NvcGUgaG9pc3RpbmcuXG4gIGNvbnN0IHBhcmFtZXRlck5hbWUgPSBwYXJhbWV0ZXIubmFtZS50ZXh0O1xuXG4gIC8vIEluIFRTIDIuMyBlbnVtcywgdGhlIElJRkUgY29udGFpbnMgb25seSBleHByZXNzaW9ucyB3aXRoIGEgY2VydGFpbiBmb3JtYXQuXG4gIC8vIElmIHdlIGZpbmQgYW55IHRoYXQgaXMgZGlmZmVyZW50LCB3ZSBpZ25vcmUgdGhlIHdob2xlIHRoaW5nLlxuICBmb3IgKGxldCBib2R5SW5kZXggPSAwOyBib2R5SW5kZXggPCBleHByZXNzaW9uLmJvZHkuc3RhdGVtZW50cy5sZW5ndGg7ICsrYm9keUluZGV4KSB7XG4gICAgY29uc3QgYm9keVN0YXRlbWVudCA9IGV4cHJlc3Npb24uYm9keS5zdGF0ZW1lbnRzW2JvZHlJbmRleF07XG5cbiAgICBpZiAoIXRzLmlzRXhwcmVzc2lvblN0YXRlbWVudChib2R5U3RhdGVtZW50KSB8fCAhYm9keVN0YXRlbWVudC5leHByZXNzaW9uKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoIXRzLmlzQmluYXJ5RXhwcmVzc2lvbihib2R5U3RhdGVtZW50LmV4cHJlc3Npb24pXG4gICAgICAgIHx8IGJvZHlTdGF0ZW1lbnQuZXhwcmVzc2lvbi5vcGVyYXRvclRva2VuLmtpbmQgIT09IHRzLlN5bnRheEtpbmQuRmlyc3RBc3NpZ25tZW50KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBhc3NpZ25tZW50ID0gYm9keVN0YXRlbWVudC5leHByZXNzaW9uLmxlZnQ7XG4gICAgY29uc3QgdmFsdWUgPSBib2R5U3RhdGVtZW50LmV4cHJlc3Npb24ucmlnaHQ7XG4gICAgaWYgKCF0cy5pc0VsZW1lbnRBY2Nlc3NFeHByZXNzaW9uKGFzc2lnbm1lbnQpIHx8ICF0cy5pc1N0cmluZ0xpdGVyYWwodmFsdWUpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoIXRzLmlzSWRlbnRpZmllcihhc3NpZ25tZW50LmV4cHJlc3Npb24pIHx8IGFzc2lnbm1lbnQuZXhwcmVzc2lvbi50ZXh0ICE9PSBwYXJhbWV0ZXJOYW1lKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBtZW1iZXJBcmd1bWVudCA9IGFzc2lnbm1lbnQuYXJndW1lbnRFeHByZXNzaW9uO1xuICAgIGlmICghbWVtYmVyQXJndW1lbnQgfHwgIXRzLmlzQmluYXJ5RXhwcmVzc2lvbihtZW1iZXJBcmd1bWVudClcbiAgICAgICAgfHwgbWVtYmVyQXJndW1lbnQub3BlcmF0b3JUb2tlbi5raW5kICE9PSB0cy5TeW50YXhLaW5kLkZpcnN0QXNzaWdubWVudCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG5cbiAgICBpZiAoIXRzLmlzRWxlbWVudEFjY2Vzc0V4cHJlc3Npb24obWVtYmVyQXJndW1lbnQubGVmdCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmICghdHMuaXNJZGVudGlmaWVyKG1lbWJlckFyZ3VtZW50LmxlZnQuZXhwcmVzc2lvbilcbiAgICAgIHx8IG1lbWJlckFyZ3VtZW50LmxlZnQuZXhwcmVzc2lvbi50ZXh0ICE9PSBwYXJhbWV0ZXJOYW1lKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoIW1lbWJlckFyZ3VtZW50LmxlZnQuYXJndW1lbnRFeHByZXNzaW9uXG4gICAgICAgIHx8ICF0cy5pc1N0cmluZ0xpdGVyYWwobWVtYmVyQXJndW1lbnQubGVmdC5hcmd1bWVudEV4cHJlc3Npb24pKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAobWVtYmVyQXJndW1lbnQubGVmdC5hcmd1bWVudEV4cHJlc3Npb24udGV4dCAhPT0gdmFsdWUudGV4dCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIFtjYWxsRXhwcmVzc2lvbiwgZXhwb3J0RXhwcmVzc2lvbl07XG59XG5cbi8vIFRTIDIuMiBlbnVtcyBoYXZlIHN0YXRlbWVudHMgYWZ0ZXIgdGhlIHZhcmlhYmxlIGRlY2xhcmF0aW9uLCB3aXRoIGluZGV4IHN0YXRlbWVudHMgZm9sbG93ZWRcbi8vIGJ5IHZhbHVlIHN0YXRlbWVudHMuXG5mdW5jdGlvbiBmaW5kVHMyXzJFbnVtU3RhdGVtZW50cyhcbiAgbmFtZTogc3RyaW5nLFxuICBzdGF0ZW1lbnRzOiB0cy5Ob2RlQXJyYXk8dHMuU3RhdGVtZW50PixcbiAgc3RhdGVtZW50T2Zmc2V0OiBudW1iZXIsXG4pOiB0cy5TdGF0ZW1lbnRbXSB7XG4gIGNvbnN0IGVudW1WYWx1ZVN0YXRlbWVudHM6IHRzLlN0YXRlbWVudFtdID0gW107XG4gIGNvbnN0IG1lbWJlck5hbWVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gIGxldCBpbmRleCA9IHN0YXRlbWVudE9mZnNldDtcbiAgZm9yICg7IGluZGV4IDwgc3RhdGVtZW50cy5sZW5ndGg7ICsraW5kZXgpIHtcbiAgICAvLyBFbnN1cmUgYWxsIHN0YXRlbWVudHMgYXJlIG9mIHRoZSBleHBlY3RlZCBmb3JtYXQgYW5kIHVzaW5nIHRoZSByaWdodCBpZGVudGlmZXIuXG4gICAgLy8gV2hlbiB3ZSBmaW5kIGEgc3RhdGVtZW50IHRoYXQgaXNuJ3QgcGFydCBvZiB0aGUgZW51bSwgcmV0dXJuIHdoYXQgd2UgY29sbGVjdGVkIHNvIGZhci5cbiAgICBjb25zdCBjdXJyZW50ID0gc3RhdGVtZW50c1tpbmRleF07XG4gICAgaWYgKCF0cy5pc0V4cHJlc3Npb25TdGF0ZW1lbnQoY3VycmVudCkgfHwgIXRzLmlzQmluYXJ5RXhwcmVzc2lvbihjdXJyZW50LmV4cHJlc3Npb24pKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBjb25zdCBwcm9wZXJ0eSA9IGN1cnJlbnQuZXhwcmVzc2lvbi5sZWZ0O1xuICAgIGlmICghcHJvcGVydHkgfHwgIXRzLmlzUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKHByb3BlcnR5KSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKCF0cy5pc0lkZW50aWZpZXIocHJvcGVydHkuZXhwcmVzc2lvbikgfHwgcHJvcGVydHkuZXhwcmVzc2lvbi50ZXh0ICE9PSBuYW1lKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBtZW1iZXJOYW1lcy5wdXNoKHByb3BlcnR5Lm5hbWUudGV4dCk7XG4gICAgZW51bVZhbHVlU3RhdGVtZW50cy5wdXNoKGN1cnJlbnQpO1xuICB9XG5cbiAgaWYgKGVudW1WYWx1ZVN0YXRlbWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgY29uc3QgZW51bU5hbWVTdGF0ZW1lbnRzID0gZmluZEVudW1OYW1lU3RhdGVtZW50cyhuYW1lLCBzdGF0ZW1lbnRzLCBpbmRleCwgbWVtYmVyTmFtZXMpO1xuICBpZiAoZW51bU5hbWVTdGF0ZW1lbnRzLmxlbmd0aCAhPT0gZW51bVZhbHVlU3RhdGVtZW50cy5sZW5ndGgpIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICByZXR1cm4gZW51bVZhbHVlU3RhdGVtZW50cy5jb25jYXQoZW51bU5hbWVTdGF0ZW1lbnRzKTtcbn1cblxuLy8gVHNpY2tsZSBlbnVtcyBoYXZlIGEgdmFyaWFibGUgc3RhdGVtZW50IHdpdGggaW5kZXhlcywgZm9sbG93ZWQgYnkgdmFsdWUgc3RhdGVtZW50cy5cbi8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vYW5ndWxhci9kZXZraXQvaXNzdWVzLzIyOSNpc3N1ZWNvbW1lbnQtMzM4NTEyMDU2IGZvcmUgbW9yZSBpbmZvcm1hdGlvbi5cbmZ1bmN0aW9uIGZpbmRFbnVtTmFtZVN0YXRlbWVudHMoXG4gIG5hbWU6IHN0cmluZyxcbiAgc3RhdGVtZW50czogdHMuTm9kZUFycmF5PHRzLlN0YXRlbWVudD4sXG4gIHN0YXRlbWVudE9mZnNldDogbnVtYmVyLFxuICBtZW1iZXJOYW1lcz86IHN0cmluZ1tdLFxuKTogdHMuU3RhdGVtZW50W10ge1xuICBjb25zdCBlbnVtU3RhdGVtZW50czogdHMuU3RhdGVtZW50W10gPSBbXTtcblxuICBmb3IgKGxldCBpbmRleCA9IHN0YXRlbWVudE9mZnNldDsgaW5kZXggPCBzdGF0ZW1lbnRzLmxlbmd0aDsgKytpbmRleCkge1xuICAgIC8vIEVuc3VyZSBhbGwgc3RhdGVtZW50cyBhcmUgb2YgdGhlIGV4cGVjdGVkIGZvcm1hdCBhbmQgdXNpbmcgdGhlIHJpZ2h0IGlkZW50aWZlci5cbiAgICAvLyBXaGVuIHdlIGZpbmQgYSBzdGF0ZW1lbnQgdGhhdCBpc24ndCBwYXJ0IG9mIHRoZSBlbnVtLCByZXR1cm4gd2hhdCB3ZSBjb2xsZWN0ZWQgc28gZmFyLlxuICAgIGNvbnN0IGN1cnJlbnQgPSBzdGF0ZW1lbnRzW2luZGV4XTtcbiAgICBpZiAoIXRzLmlzRXhwcmVzc2lvblN0YXRlbWVudChjdXJyZW50KSB8fCAhdHMuaXNCaW5hcnlFeHByZXNzaW9uKGN1cnJlbnQuZXhwcmVzc2lvbikpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGNvbnN0IGFjY2VzcyA9IGN1cnJlbnQuZXhwcmVzc2lvbi5sZWZ0O1xuICAgIGNvbnN0IHZhbHVlID0gY3VycmVudC5leHByZXNzaW9uLnJpZ2h0O1xuICAgIGlmICghYWNjZXNzIHx8ICF0cy5pc0VsZW1lbnRBY2Nlc3NFeHByZXNzaW9uKGFjY2VzcykgfHwgIXZhbHVlIHx8ICF0cy5pc1N0cmluZ0xpdGVyYWwodmFsdWUpKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBpZiAobWVtYmVyTmFtZXMgJiYgIW1lbWJlck5hbWVzLmluY2x1ZGVzKHZhbHVlLnRleHQpKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoIXRzLmlzSWRlbnRpZmllcihhY2Nlc3MuZXhwcmVzc2lvbikgfHwgYWNjZXNzLmV4cHJlc3Npb24udGV4dCAhPT0gbmFtZSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKCFhY2Nlc3MuYXJndW1lbnRFeHByZXNzaW9uIHx8ICF0cy5pc1Byb3BlcnR5QWNjZXNzRXhwcmVzc2lvbihhY2Nlc3MuYXJndW1lbnRFeHByZXNzaW9uKSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgY29uc3QgZW51bUV4cHJlc3Npb24gPSBhY2Nlc3MuYXJndW1lbnRFeHByZXNzaW9uLmV4cHJlc3Npb247XG4gICAgaWYgKCF0cy5pc0lkZW50aWZpZXIoZW51bUV4cHJlc3Npb24pIHx8IGVudW1FeHByZXNzaW9uLnRleHQgIT09IG5hbWUpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGlmICh2YWx1ZS50ZXh0ICE9PSBhY2Nlc3MuYXJndW1lbnRFeHByZXNzaW9uLm5hbWUudGV4dCkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgZW51bVN0YXRlbWVudHMucHVzaChjdXJyZW50KTtcbiAgfVxuXG4gIHJldHVybiBlbnVtU3RhdGVtZW50cztcbn1cblxuZnVuY3Rpb24gYWRkUHVyZUNvbW1lbnQ8VCBleHRlbmRzIHRzLk5vZGU+KG5vZGU6IFQpOiBUIHtcbiAgY29uc3QgcHVyZUZ1bmN0aW9uQ29tbWVudCA9ICdAX19QVVJFX18nO1xuXG4gIHJldHVybiB0cy5hZGRTeW50aGV0aWNMZWFkaW5nQ29tbWVudChcbiAgICBub2RlLFxuICAgIHRzLlN5bnRheEtpbmQuTXVsdGlMaW5lQ29tbWVudFRyaXZpYSxcbiAgICBwdXJlRnVuY3Rpb25Db21tZW50LFxuICAgIGZhbHNlLFxuICApO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVIb3N0Tm9kZShcbiAgaG9zdE5vZGU6IHRzLlZhcmlhYmxlU3RhdGVtZW50LFxuICBleHByZXNzaW9uOiB0cy5FeHByZXNzaW9uLFxuKTogdHMuU3RhdGVtZW50IHtcblxuICAvLyBVcGRhdGUgZXhpc3RpbmcgaG9zdCBub2RlIHdpdGggdGhlIHB1cmUgY29tbWVudCBiZWZvcmUgdGhlIHZhcmlhYmxlIGRlY2xhcmF0aW9uIGluaXRpYWxpemVyLlxuICBjb25zdCB2YXJpYWJsZURlY2xhcmF0aW9uID0gaG9zdE5vZGUuZGVjbGFyYXRpb25MaXN0LmRlY2xhcmF0aW9uc1swXTtcbiAgY29uc3Qgb3V0ZXJWYXJTdG10ID0gdHMudXBkYXRlVmFyaWFibGVTdGF0ZW1lbnQoXG4gICAgaG9zdE5vZGUsXG4gICAgaG9zdE5vZGUubW9kaWZpZXJzLFxuICAgIHRzLnVwZGF0ZVZhcmlhYmxlRGVjbGFyYXRpb25MaXN0KFxuICAgICAgaG9zdE5vZGUuZGVjbGFyYXRpb25MaXN0LFxuICAgICAgW1xuICAgICAgICB0cy51cGRhdGVWYXJpYWJsZURlY2xhcmF0aW9uKFxuICAgICAgICAgIHZhcmlhYmxlRGVjbGFyYXRpb24sXG4gICAgICAgICAgdmFyaWFibGVEZWNsYXJhdGlvbi5uYW1lLFxuICAgICAgICAgIHZhcmlhYmxlRGVjbGFyYXRpb24udHlwZSxcbiAgICAgICAgICBleHByZXNzaW9uLFxuICAgICAgICApLFxuICAgICAgXSxcbiAgICApLFxuICApO1xuXG4gIHJldHVybiBvdXRlclZhclN0bXQ7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUVudW1JaWZlKFxuICBob3N0Tm9kZTogdHMuVmFyaWFibGVTdGF0ZW1lbnQsXG4gIGlpZmU6IHRzLkNhbGxFeHByZXNzaW9uLFxuICBleHBvcnRBc3NpZ25tZW50PzogdHMuRXhwcmVzc2lvbixcbik6IHRzLlN0YXRlbWVudCB7XG4gIGlmICghdHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbihpaWZlLmV4cHJlc3Npb24pXG4gICAgICB8fCAhdHMuaXNGdW5jdGlvbkV4cHJlc3Npb24oaWlmZS5leHByZXNzaW9uLmV4cHJlc3Npb24pKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIElJRkUgU3RydWN0dXJlJyk7XG4gIH1cblxuICAvLyBJZ25vcmUgZXhwb3J0IGFzc2lnbm1lbnQgaWYgdmFyaWFibGUgaXMgZGlyZWN0bHkgZXhwb3J0ZWRcbiAgaWYgKGhvc3ROb2RlLm1vZGlmaWVyc1xuICAgICAgJiYgaG9zdE5vZGUubW9kaWZpZXJzLmZpbmRJbmRleChtID0+IG0ua2luZCA9PSB0cy5TeW50YXhLaW5kLkV4cG9ydEtleXdvcmQpICE9IC0xKSB7XG4gICAgZXhwb3J0QXNzaWdubWVudCA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGNvbnN0IGV4cHJlc3Npb24gPSBpaWZlLmV4cHJlc3Npb24uZXhwcmVzc2lvbjtcbiAgY29uc3QgdXBkYXRlZEZ1bmN0aW9uID0gdHMudXBkYXRlRnVuY3Rpb25FeHByZXNzaW9uKFxuICAgIGV4cHJlc3Npb24sXG4gICAgZXhwcmVzc2lvbi5tb2RpZmllcnMsXG4gICAgZXhwcmVzc2lvbi5hc3Rlcmlza1Rva2VuLFxuICAgIGV4cHJlc3Npb24ubmFtZSxcbiAgICBleHByZXNzaW9uLnR5cGVQYXJhbWV0ZXJzLFxuICAgIGV4cHJlc3Npb24ucGFyYW1ldGVycyxcbiAgICBleHByZXNzaW9uLnR5cGUsXG4gICAgdHMudXBkYXRlQmxvY2soXG4gICAgICBleHByZXNzaW9uLmJvZHksXG4gICAgICBbXG4gICAgICAgIC4uLmV4cHJlc3Npb24uYm9keS5zdGF0ZW1lbnRzLFxuICAgICAgICB0cy5jcmVhdGVSZXR1cm4oZXhwcmVzc2lvbi5wYXJhbWV0ZXJzWzBdLm5hbWUgYXMgdHMuSWRlbnRpZmllciksXG4gICAgICBdLFxuICAgICksXG4gICk7XG5cbiAgbGV0IGFyZzogdHMuRXhwcmVzc2lvbiA9IHRzLmNyZWF0ZU9iamVjdExpdGVyYWwoKTtcbiAgaWYgKGV4cG9ydEFzc2lnbm1lbnQpIHtcbiAgICBhcmcgPSB0cy5jcmVhdGVCaW5hcnkoZXhwb3J0QXNzaWdubWVudCwgdHMuU3ludGF4S2luZC5CYXJCYXJUb2tlbiwgYXJnKTtcbiAgfVxuICBjb25zdCB1cGRhdGVkSWlmZSA9IHRzLnVwZGF0ZUNhbGwoXG4gICAgaWlmZSxcbiAgICB0cy51cGRhdGVQYXJlbihcbiAgICAgIGlpZmUuZXhwcmVzc2lvbixcbiAgICAgIHVwZGF0ZWRGdW5jdGlvbixcbiAgICApLFxuICAgIGlpZmUudHlwZUFyZ3VtZW50cyxcbiAgICBbYXJnXSxcbiAgKTtcblxuICBsZXQgdmFsdWU6IHRzLkV4cHJlc3Npb24gPSBhZGRQdXJlQ29tbWVudCh1cGRhdGVkSWlmZSk7XG4gIGlmIChleHBvcnRBc3NpZ25tZW50KSB7XG4gICAgdmFsdWUgPSB0cy5jcmVhdGVCaW5hcnkoXG4gICAgICBleHBvcnRBc3NpZ25tZW50LFxuICAgICAgdHMuU3ludGF4S2luZC5GaXJzdEFzc2lnbm1lbnQsXG4gICAgICB1cGRhdGVkSWlmZSk7XG4gIH1cblxuICByZXR1cm4gdXBkYXRlSG9zdE5vZGUoaG9zdE5vZGUsIHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlV3JhcHBlZEVudW0oXG4gIG5hbWU6IHN0cmluZyxcbiAgaG9zdE5vZGU6IHRzLlZhcmlhYmxlU3RhdGVtZW50LFxuICBzdGF0ZW1lbnRzOiBBcnJheTx0cy5TdGF0ZW1lbnQ+LFxuICBsaXRlcmFsSW5pdGlhbGl6ZXI6IHRzLk9iamVjdExpdGVyYWxFeHByZXNzaW9uIHwgdW5kZWZpbmVkLFxuKTogdHMuU3RhdGVtZW50IHtcbiAgbGl0ZXJhbEluaXRpYWxpemVyID0gbGl0ZXJhbEluaXRpYWxpemVyIHx8IHRzLmNyZWF0ZU9iamVjdExpdGVyYWwoKTtcbiAgY29uc3QgaW5uZXJWYXJTdG10ID0gdHMuY3JlYXRlVmFyaWFibGVTdGF0ZW1lbnQoXG4gICAgdW5kZWZpbmVkLFxuICAgIHRzLmNyZWF0ZVZhcmlhYmxlRGVjbGFyYXRpb25MaXN0KFtcbiAgICAgIHRzLmNyZWF0ZVZhcmlhYmxlRGVjbGFyYXRpb24obmFtZSwgdW5kZWZpbmVkLCBsaXRlcmFsSW5pdGlhbGl6ZXIpLFxuICAgIF0pLFxuICApO1xuXG4gIGNvbnN0IGlubmVyUmV0dXJuID0gdHMuY3JlYXRlUmV0dXJuKHRzLmNyZWF0ZUlkZW50aWZpZXIobmFtZSkpO1xuXG4gIGNvbnN0IGlpZmUgPSB0cy5jcmVhdGVJbW1lZGlhdGVseUludm9rZWRGdW5jdGlvbkV4cHJlc3Npb24oW1xuICAgIGlubmVyVmFyU3RtdCxcbiAgICAuLi5zdGF0ZW1lbnRzLFxuICAgIGlubmVyUmV0dXJuLFxuICBdKTtcblxuICByZXR1cm4gdXBkYXRlSG9zdE5vZGUoaG9zdE5vZGUsIGFkZFB1cmVDb21tZW50KHRzLmNyZWF0ZVBhcmVuKGlpZmUpKSk7XG59XG4iXX0=