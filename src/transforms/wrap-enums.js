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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid3JhcC1lbnVtcy5qcyIsInNvdXJjZVJvb3QiOiIuLyIsInNvdXJjZXMiOlsicGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYnVpbGRfb3B0aW1pemVyL3NyYy90cmFuc2Zvcm1zL3dyYXAtZW51bXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7Ozs7O0dBTUc7QUFDSCxpQ0FBaUM7QUFFakMsU0FBUyxXQUFXLENBQUMsSUFBYTtJQUNoQyxPQUFPLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxLQUFLO1dBQ2pDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxXQUFXO1dBQ3ZDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxVQUFVO1dBQ3RDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhO1dBQ3pDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUM7QUFDaEQsQ0FBQztBQUVELFNBQWdCLHVCQUF1QjtJQUNyQyxPQUFPLENBQUMsT0FBaUMsRUFBaUMsRUFBRTtRQUMxRSxNQUFNLFdBQVcsR0FBa0MsQ0FBQyxFQUFpQixFQUFFLEVBQUU7WUFFdkUsTUFBTSxNQUFNLEdBQUcsb0JBQW9CLENBQUMsRUFBRSxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUU1RCxPQUFPLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDN0UsQ0FBQyxDQUFDO1FBRUYsT0FBTyxXQUFXLENBQUM7SUFDckIsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQVhELDBEQVdDO0FBRUQsU0FBUyxvQkFBb0IsQ0FDM0IsVUFBc0MsRUFDdEMsT0FBaUM7SUFHakMsaURBQWlEO0lBQ2pELElBQUksaUJBQWtE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bnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBJbmMuIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuaW1wb3J0ICogYXMgdHMgZnJvbSAndHlwZXNjcmlwdCc7XG5cbmZ1bmN0aW9uIGlzQmxvY2tMaWtlKG5vZGU6IHRzLk5vZGUpOiBub2RlIGlzIHRzLkJsb2NrTGlrZSB7XG4gIHJldHVybiBub2RlLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuQmxvY2tcbiAgICAgIHx8IG5vZGUua2luZCA9PT0gdHMuU3ludGF4S2luZC5Nb2R1bGVCbG9ja1xuICAgICAgfHwgbm9kZS5raW5kID09PSB0cy5TeW50YXhLaW5kLkNhc2VDbGF1c2VcbiAgICAgIHx8IG5vZGUua2luZCA9PT0gdHMuU3ludGF4S2luZC5EZWZhdWx0Q2xhdXNlXG4gICAgICB8fCBub2RlLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuU291cmNlRmlsZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFdyYXBFbnVtc1RyYW5zZm9ybWVyKCk6IHRzLlRyYW5zZm9ybWVyRmFjdG9yeTx0cy5Tb3VyY2VGaWxlPiB7XG4gIHJldHVybiAoY29udGV4dDogdHMuVHJhbnNmb3JtYXRpb25Db250ZXh0KTogdHMuVHJhbnNmb3JtZXI8dHMuU291cmNlRmlsZT4gPT4ge1xuICAgIGNvbnN0IHRyYW5zZm9ybWVyOiB0cy5UcmFuc2Zvcm1lcjx0cy5Tb3VyY2VGaWxlPiA9IChzZjogdHMuU291cmNlRmlsZSkgPT4ge1xuXG4gICAgICBjb25zdCByZXN1bHQgPSB2aXNpdEJsb2NrU3RhdGVtZW50cyhzZi5zdGF0ZW1lbnRzLCBjb250ZXh0KTtcblxuICAgICAgcmV0dXJuIHRzLnVwZGF0ZVNvdXJjZUZpbGVOb2RlKHNmLCB0cy5zZXRUZXh0UmFuZ2UocmVzdWx0LCBzZi5zdGF0ZW1lbnRzKSk7XG4gICAgfTtcblxuICAgIHJldHVybiB0cmFuc2Zvcm1lcjtcbiAgfTtcbn1cblxuZnVuY3Rpb24gdmlzaXRCbG9ja1N0YXRlbWVudHMoXG4gIHN0YXRlbWVudHM6IHRzLk5vZGVBcnJheTx0cy5TdGF0ZW1lbnQ+LFxuICBjb250ZXh0OiB0cy5UcmFuc2Zvcm1hdGlvbkNvbnRleHQsXG4pOiB0cy5Ob2RlQXJyYXk8dHMuU3RhdGVtZW50PiB7XG5cbiAgLy8gY29weSBvZiBzdGF0ZW1lbnRzIHRvIG1vZGlmeTsgbGF6eSBpbml0aWFsaXplZFxuICBsZXQgdXBkYXRlZFN0YXRlbWVudHM6IEFycmF5PHRzLlN0YXRlbWVudD4gfCB1bmRlZmluZWQ7XG5cbiAgY29uc3QgdmlzaXRvcjogdHMuVmlzaXRvciA9IChub2RlKSA9PiB7XG4gICAgaWYgKGlzQmxvY2tMaWtlKG5vZGUpKSB7XG4gICAgICBsZXQgcmVzdWx0ID0gdmlzaXRCbG9ja1N0YXRlbWVudHMobm9kZS5zdGF0ZW1lbnRzLCBjb250ZXh0KTtcbiAgICAgIGlmIChyZXN1bHQgPT09IG5vZGUuc3RhdGVtZW50cykge1xuICAgICAgICByZXR1cm4gbm9kZTtcbiAgICAgIH1cbiAgICAgIHJlc3VsdCA9IHRzLnNldFRleHRSYW5nZShyZXN1bHQsIG5vZGUuc3RhdGVtZW50cyk7XG4gICAgICBzd2l0Y2ggKG5vZGUua2luZCkge1xuICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuQmxvY2s6XG4gICAgICAgICAgcmV0dXJuIHRzLnVwZGF0ZUJsb2NrKG5vZGUgYXMgdHMuQmxvY2ssIHJlc3VsdCk7XG4gICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5Nb2R1bGVCbG9jazpcbiAgICAgICAgICByZXR1cm4gdHMudXBkYXRlTW9kdWxlQmxvY2sobm9kZSBhcyB0cy5Nb2R1bGVCbG9jaywgcmVzdWx0KTtcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkNhc2VDbGF1c2U6XG4gICAgICAgICAgY29uc3QgY2xhdXNlID0gbm9kZSBhcyB0cy5DYXNlQ2xhdXNlO1xuXG4gICAgICAgICAgcmV0dXJuIHRzLnVwZGF0ZUNhc2VDbGF1c2UoY2xhdXNlLCBjbGF1c2UuZXhwcmVzc2lvbiwgcmVzdWx0KTtcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkRlZmF1bHRDbGF1c2U6XG4gICAgICAgICAgcmV0dXJuIHRzLnVwZGF0ZURlZmF1bHRDbGF1c2Uobm9kZSBhcyB0cy5EZWZhdWx0Q2xhdXNlLCByZXN1bHQpO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIHJldHVybiBub2RlO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdHMudmlzaXRFYWNoQ2hpbGQobm9kZSwgdmlzaXRvciwgY29udGV4dCk7XG4gICAgfVxuICB9O1xuXG4gIC8vICdvSW5kZXgnIGlzIHRoZSBvcmlnaW5hbCBzdGF0ZW1lbnQgaW5kZXg7ICd1SW5kZXgnIGlzIHRoZSB1cGRhdGVkIHN0YXRlbWVudCBpbmRleFxuICBmb3IgKGxldCBvSW5kZXggPSAwLCB1SW5kZXggPSAwOyBvSW5kZXggPCBzdGF0ZW1lbnRzLmxlbmd0aDsgb0luZGV4KyssIHVJbmRleCsrKSB7XG4gICAgY29uc3QgY3VycmVudFN0YXRlbWVudCA9IHN0YXRlbWVudHNbb0luZGV4XTtcblxuICAgIC8vIHRoZXNlIGNhbid0IGNvbnRhaW4gYW4gZW51bSBkZWNsYXJhdGlvblxuICAgIGlmIChjdXJyZW50U3RhdGVtZW50LmtpbmQgPT09IHRzLlN5bnRheEtpbmQuSW1wb3J0RGVjbGFyYXRpb24pIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIGVudW0gZGVjbGFyYXRpb25zIG11c3Q6XG4gICAgLy8gICAqIG5vdCBiZSBsYXN0IHN0YXRlbWVudFxuICAgIC8vICAgKiBiZSBhIHZhcmlhYmxlIHN0YXRlbWVudFxuICAgIC8vICAgKiBoYXZlIG9ubHkgb25lIGRlY2xhcmF0aW9uXG4gICAgLy8gICAqIGhhdmUgYW4gaWRlbnRpZmVyIGFzIGEgZGVjbGFyYXRpb24gbmFtZVxuICAgIGlmIChvSW5kZXggPCBzdGF0ZW1lbnRzLmxlbmd0aCAtIDFcbiAgICAgICAgJiYgdHMuaXNWYXJpYWJsZVN0YXRlbWVudChjdXJyZW50U3RhdGVtZW50KVxuICAgICAgICAmJiBjdXJyZW50U3RhdGVtZW50LmRlY2xhcmF0aW9uTGlzdC5kZWNsYXJhdGlvbnMubGVuZ3RoID09PSAxKSB7XG5cbiAgICAgIGNvbnN0IHZhcmlhYmxlRGVjbGFyYXRpb24gPSBjdXJyZW50U3RhdGVtZW50LmRlY2xhcmF0aW9uTGlzdC5kZWNsYXJhdGlvbnNbMF07XG4gICAgICBpZiAodHMuaXNJZGVudGlmaWVyKHZhcmlhYmxlRGVjbGFyYXRpb24ubmFtZSkpIHtcbiAgICAgICAgY29uc3QgbmFtZSA9IHZhcmlhYmxlRGVjbGFyYXRpb24ubmFtZS50ZXh0O1xuXG4gICAgICAgIGlmICghdmFyaWFibGVEZWNsYXJhdGlvbi5pbml0aWFsaXplcikge1xuICAgICAgICAgIGNvbnN0IGlpZmUgPSBmaW5kVHMyXzNFbnVtSWlmZShuYW1lLCBzdGF0ZW1lbnRzW29JbmRleCArIDFdKTtcbiAgICAgICAgICBpZiAoaWlmZSkge1xuICAgICAgICAgICAgLy8gZm91bmQgYW4gZW51bVxuICAgICAgICAgICAgaWYgKCF1cGRhdGVkU3RhdGVtZW50cykge1xuICAgICAgICAgICAgICB1cGRhdGVkU3RhdGVtZW50cyA9IHN0YXRlbWVudHMuc2xpY2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIHVwZGF0ZSBJSUZFIGFuZCByZXBsYWNlIHZhcmlhYmxlIHN0YXRlbWVudCBhbmQgb2xkIElJRkVcbiAgICAgICAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzLnNwbGljZSh1SW5kZXgsIDIsIHVwZGF0ZUVudW1JaWZlKFxuICAgICAgICAgICAgICBjdXJyZW50U3RhdGVtZW50LFxuICAgICAgICAgICAgICBpaWZlWzBdLFxuICAgICAgICAgICAgICBpaWZlWzFdLFxuICAgICAgICAgICAgKSk7XG4gICAgICAgICAgICAvLyBza2lwIElJRkUgc3RhdGVtZW50XG4gICAgICAgICAgICBvSW5kZXgrKztcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICh0cy5pc09iamVjdExpdGVyYWxFeHByZXNzaW9uKHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIpXG4gICAgICAgICAgICAgICAgICAgJiYgdmFyaWFibGVEZWNsYXJhdGlvbi5pbml0aWFsaXplci5wcm9wZXJ0aWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnN0IGVudW1TdGF0ZW1lbnRzID0gZmluZFRzMl8yRW51bVN0YXRlbWVudHMobmFtZSwgc3RhdGVtZW50cywgb0luZGV4ICsgMSk7XG4gICAgICAgICAgaWYgKGVudW1TdGF0ZW1lbnRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIC8vIGZvdW5kIGFuIGVudW1cbiAgICAgICAgICAgIGlmICghdXBkYXRlZFN0YXRlbWVudHMpIHtcbiAgICAgICAgICAgICAgdXBkYXRlZFN0YXRlbWVudHMgPSBzdGF0ZW1lbnRzLnNsaWNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBjcmVhdGUgd3JhcHBlciBhbmQgcmVwbGFjZSB2YXJpYWJsZSBzdGF0ZW1lbnQgYW5kIGVudW0gbWVtYmVyIHN0YXRlbWVudHNcbiAgICAgICAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzLnNwbGljZSh1SW5kZXgsIGVudW1TdGF0ZW1lbnRzLmxlbmd0aCArIDEsIGNyZWF0ZVdyYXBwZWRFbnVtKFxuICAgICAgICAgICAgICBuYW1lLFxuICAgICAgICAgICAgICBjdXJyZW50U3RhdGVtZW50LFxuICAgICAgICAgICAgICBlbnVtU3RhdGVtZW50cyxcbiAgICAgICAgICAgICAgdmFyaWFibGVEZWNsYXJhdGlvbi5pbml0aWFsaXplcixcbiAgICAgICAgICAgICkpO1xuICAgICAgICAgICAgLy8gc2tpcCBlbnVtIG1lbWJlciBkZWNsYXJhdGlvbnNcbiAgICAgICAgICAgIG9JbmRleCArPSBlbnVtU3RhdGVtZW50cy5sZW5ndGg7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodHMuaXNPYmplY3RMaXRlcmFsRXhwcmVzc2lvbih2YXJpYWJsZURlY2xhcmF0aW9uLmluaXRpYWxpemVyKVxuICAgICAgICAgICYmIHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIucHJvcGVydGllcy5sZW5ndGggIT09IDApIHtcbiAgICAgICAgICBjb25zdCBsaXRlcmFsUHJvcGVydHlDb3VudCA9IHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIucHJvcGVydGllcy5sZW5ndGg7XG4gICAgICAgICAgY29uc3QgZW51bVN0YXRlbWVudHMgPSBmaW5kRW51bU5hbWVTdGF0ZW1lbnRzKG5hbWUsIHN0YXRlbWVudHMsIG9JbmRleCArIDEpO1xuICAgICAgICAgIGlmIChlbnVtU3RhdGVtZW50cy5sZW5ndGggPT09IGxpdGVyYWxQcm9wZXJ0eUNvdW50KSB7XG4gICAgICAgICAgICAvLyBmb3VuZCBhbiBlbnVtXG4gICAgICAgICAgICBpZiAoIXVwZGF0ZWRTdGF0ZW1lbnRzKSB7XG4gICAgICAgICAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzID0gc3RhdGVtZW50cy5zbGljZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gY3JlYXRlIHdyYXBwZXIgYW5kIHJlcGxhY2UgdmFyaWFibGUgc3RhdGVtZW50IGFuZCBlbnVtIG1lbWJlciBzdGF0ZW1lbnRzXG4gICAgICAgICAgICB1cGRhdGVkU3RhdGVtZW50cy5zcGxpY2UodUluZGV4LCBlbnVtU3RhdGVtZW50cy5sZW5ndGggKyAxLCBjcmVhdGVXcmFwcGVkRW51bShcbiAgICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgICAgY3VycmVudFN0YXRlbWVudCxcbiAgICAgICAgICAgICAgZW51bVN0YXRlbWVudHMsXG4gICAgICAgICAgICAgIHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIsXG4gICAgICAgICAgICApKTtcbiAgICAgICAgICAgIC8vIHNraXAgZW51bSBtZW1iZXIgZGVjbGFyYXRpb25zXG4gICAgICAgICAgICBvSW5kZXggKz0gZW51bVN0YXRlbWVudHMubGVuZ3RoO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0ID0gdHMudmlzaXROb2RlKGN1cnJlbnRTdGF0ZW1lbnQsIHZpc2l0b3IpO1xuICAgIGlmIChyZXN1bHQgIT09IGN1cnJlbnRTdGF0ZW1lbnQpIHtcbiAgICAgIGlmICghdXBkYXRlZFN0YXRlbWVudHMpIHtcbiAgICAgICAgdXBkYXRlZFN0YXRlbWVudHMgPSBzdGF0ZW1lbnRzLnNsaWNlKCk7XG4gICAgICB9XG4gICAgICB1cGRhdGVkU3RhdGVtZW50c1t1SW5kZXhdID0gcmVzdWx0O1xuICAgIH1cbiAgfVxuXG4gIC8vIGlmIGNoYW5nZXMsIHJldHVybiB1cGRhdGVkIHN0YXRlbWVudHNcbiAgLy8gb3RoZXJ3aXNlLCByZXR1cm4gb3JpZ2luYWwgYXJyYXkgaW5zdGFuY2VcbiAgcmV0dXJuIHVwZGF0ZWRTdGF0ZW1lbnRzID8gdHMuY3JlYXRlTm9kZUFycmF5KHVwZGF0ZWRTdGF0ZW1lbnRzKSA6IHN0YXRlbWVudHM7XG59XG5cbi8vIFRTIDIuMyBlbnVtcyBoYXZlIHN0YXRlbWVudHMgdGhhdCBhcmUgaW5zaWRlIGEgSUlGRS5cbmZ1bmN0aW9uIGZpbmRUczJfM0VudW1JaWZlKFxuICBuYW1lOiBzdHJpbmcsXG4gIHN0YXRlbWVudDogdHMuU3RhdGVtZW50LFxuKTogW3RzLkNhbGxFeHByZXNzaW9uLCB0cy5FeHByZXNzaW9uIHwgdW5kZWZpbmVkXSB8IG51bGwge1xuICBpZiAoIXRzLmlzRXhwcmVzc2lvblN0YXRlbWVudChzdGF0ZW1lbnQpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBsZXQgZXhwcmVzc2lvbiA9IHN0YXRlbWVudC5leHByZXNzaW9uO1xuICB3aGlsZSAodHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbihleHByZXNzaW9uKSkge1xuICAgIGV4cHJlc3Npb24gPSBleHByZXNzaW9uLmV4cHJlc3Npb247XG4gIH1cblxuICBpZiAoIWV4cHJlc3Npb24gfHwgIXRzLmlzQ2FsbEV4cHJlc3Npb24oZXhwcmVzc2lvbikgfHwgZXhwcmVzc2lvbi5hcmd1bWVudHMubGVuZ3RoICE9PSAxKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCBjYWxsRXhwcmVzc2lvbiA9IGV4cHJlc3Npb247XG4gIGxldCBleHBvcnRFeHByZXNzaW9uO1xuXG4gIGxldCBhcmd1bWVudCA9IGV4cHJlc3Npb24uYXJndW1lbnRzWzBdO1xuICBpZiAoIXRzLmlzQmluYXJ5RXhwcmVzc2lvbihhcmd1bWVudCkpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGlmICghdHMuaXNJZGVudGlmaWVyKGFyZ3VtZW50LmxlZnQpIHx8IGFyZ3VtZW50LmxlZnQudGV4dCAhPT0gbmFtZSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgbGV0IHBvdGVudGlhbEV4cG9ydCA9IGZhbHNlO1xuICBpZiAoYXJndW1lbnQub3BlcmF0b3JUb2tlbi5raW5kID09PSB0cy5TeW50YXhLaW5kLkZpcnN0QXNzaWdubWVudCkge1xuICAgIGlmICghdHMuaXNCaW5hcnlFeHByZXNzaW9uKGFyZ3VtZW50LnJpZ2h0KVxuICAgICAgICB8fCBhcmd1bWVudC5yaWdodC5vcGVyYXRvclRva2VuLmtpbmQgIT09IHRzLlN5bnRheEtpbmQuQmFyQmFyVG9rZW4pIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHBvdGVudGlhbEV4cG9ydCA9IHRydWU7XG4gICAgYXJndW1lbnQgPSBhcmd1bWVudC5yaWdodDtcbiAgfVxuXG4gIGlmICghdHMuaXNCaW5hcnlFeHByZXNzaW9uKGFyZ3VtZW50KSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgaWYgKGFyZ3VtZW50Lm9wZXJhdG9yVG9rZW4ua2luZCAhPT0gdHMuU3ludGF4S2luZC5CYXJCYXJUb2tlbikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgaWYgKHBvdGVudGlhbEV4cG9ydCAmJiAhdHMuaXNJZGVudGlmaWVyKGFyZ3VtZW50LmxlZnQpKSB7XG4gICAgZXhwb3J0RXhwcmVzc2lvbiA9IGFyZ3VtZW50LmxlZnQ7XG4gIH1cblxuICBleHByZXNzaW9uID0gZXhwcmVzc2lvbi5leHByZXNzaW9uO1xuICB3aGlsZSAodHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbihleHByZXNzaW9uKSkge1xuICAgIGV4cHJlc3Npb24gPSBleHByZXNzaW9uLmV4cHJlc3Npb247XG4gIH1cblxuICBpZiAoIWV4cHJlc3Npb24gfHwgIXRzLmlzRnVuY3Rpb25FeHByZXNzaW9uKGV4cHJlc3Npb24pIHx8IGV4cHJlc3Npb24ucGFyYW1ldGVycy5sZW5ndGggIT09IDEpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGNvbnN0IHBhcmFtZXRlciA9IGV4cHJlc3Npb24ucGFyYW1ldGVyc1swXTtcbiAgaWYgKCF0cy5pc0lkZW50aWZpZXIocGFyYW1ldGVyLm5hbWUpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvLyBUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyIGNhbiBiZSBkaWZmZXJlbnQgdGhhbiB0aGUgbmFtZSBvZiB0aGUgZW51bSBpZiBpdCB3YXMgcmVuYW1lZFxuICAvLyBkdWUgdG8gc2NvcGUgaG9pc3RpbmcuXG4gIGNvbnN0IHBhcmFtZXRlck5hbWUgPSBwYXJhbWV0ZXIubmFtZS50ZXh0O1xuXG4gIC8vIEluIFRTIDIuMyBlbnVtcywgdGhlIElJRkUgY29udGFpbnMgb25seSBleHByZXNzaW9ucyB3aXRoIGEgY2VydGFpbiBmb3JtYXQuXG4gIC8vIElmIHdlIGZpbmQgYW55IHRoYXQgaXMgZGlmZmVyZW50LCB3ZSBpZ25vcmUgdGhlIHdob2xlIHRoaW5nLlxuICBmb3IgKGxldCBib2R5SW5kZXggPSAwOyBib2R5SW5kZXggPCBleHByZXNzaW9uLmJvZHkuc3RhdGVtZW50cy5sZW5ndGg7ICsrYm9keUluZGV4KSB7XG4gICAgY29uc3QgYm9keVN0YXRlbWVudCA9IGV4cHJlc3Npb24uYm9keS5zdGF0ZW1lbnRzW2JvZHlJbmRleF07XG5cbiAgICBpZiAoIXRzLmlzRXhwcmVzc2lvblN0YXRlbWVudChib2R5U3RhdGVtZW50KSB8fCAhYm9keVN0YXRlbWVudC5leHByZXNzaW9uKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoIXRzLmlzQmluYXJ5RXhwcmVzc2lvbihib2R5U3RhdGVtZW50LmV4cHJlc3Npb24pXG4gICAgICAgIHx8IGJvZHlTdGF0ZW1lbnQuZXhwcmVzc2lvbi5vcGVyYXRvclRva2VuLmtpbmQgIT09IHRzLlN5bnRheEtpbmQuRmlyc3RBc3NpZ25tZW50KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBhc3NpZ25tZW50ID0gYm9keVN0YXRlbWVudC5leHByZXNzaW9uLmxlZnQ7XG4gICAgY29uc3QgdmFsdWUgPSBib2R5U3RhdGVtZW50LmV4cHJlc3Npb24ucmlnaHQ7XG4gICAgaWYgKCF0cy5pc0VsZW1lbnRBY2Nlc3NFeHByZXNzaW9uKGFzc2lnbm1lbnQpIHx8ICF0cy5pc1N0cmluZ0xpdGVyYWwodmFsdWUpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoIXRzLmlzSWRlbnRpZmllcihhc3NpZ25tZW50LmV4cHJlc3Npb24pIHx8IGFzc2lnbm1lbnQuZXhwcmVzc2lvbi50ZXh0ICE9PSBwYXJhbWV0ZXJOYW1lKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBtZW1iZXJBcmd1bWVudCA9IGFzc2lnbm1lbnQuYXJndW1lbnRFeHByZXNzaW9uO1xuICAgIGlmICghbWVtYmVyQXJndW1lbnQgfHwgIXRzLmlzQmluYXJ5RXhwcmVzc2lvbihtZW1iZXJBcmd1bWVudClcbiAgICAgICAgfHwgbWVtYmVyQXJndW1lbnQub3BlcmF0b3JUb2tlbi5raW5kICE9PSB0cy5TeW50YXhLaW5kLkZpcnN0QXNzaWdubWVudCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG5cbiAgICBpZiAoIXRzLmlzRWxlbWVudEFjY2Vzc0V4cHJlc3Npb24obWVtYmVyQXJndW1lbnQubGVmdCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmICghdHMuaXNJZGVudGlmaWVyKG1lbWJlckFyZ3VtZW50LmxlZnQuZXhwcmVzc2lvbilcbiAgICAgIHx8IG1lbWJlckFyZ3VtZW50LmxlZnQuZXhwcmVzc2lvbi50ZXh0ICE9PSBwYXJhbWV0ZXJOYW1lKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoIW1lbWJlckFyZ3VtZW50LmxlZnQuYXJndW1lbnRFeHByZXNzaW9uXG4gICAgICAgIHx8ICF0cy5pc1N0cmluZ0xpdGVyYWwobWVtYmVyQXJndW1lbnQubGVmdC5hcmd1bWVudEV4cHJlc3Npb24pKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAobWVtYmVyQXJndW1lbnQubGVmdC5hcmd1bWVudEV4cHJlc3Npb24udGV4dCAhPT0gdmFsdWUudGV4dCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIFtjYWxsRXhwcmVzc2lvbiwgZXhwb3J0RXhwcmVzc2lvbl07XG59XG5cbi8vIFRTIDIuMiBlbnVtcyBoYXZlIHN0YXRlbWVudHMgYWZ0ZXIgdGhlIHZhcmlhYmxlIGRlY2xhcmF0aW9uLCB3aXRoIGluZGV4IHN0YXRlbWVudHMgZm9sbG93ZWRcbi8vIGJ5IHZhbHVlIHN0YXRlbWVudHMuXG5mdW5jdGlvbiBmaW5kVHMyXzJFbnVtU3RhdGVtZW50cyhcbiAgbmFtZTogc3RyaW5nLFxuICBzdGF0ZW1lbnRzOiB0cy5Ob2RlQXJyYXk8dHMuU3RhdGVtZW50PixcbiAgc3RhdGVtZW50T2Zmc2V0OiBudW1iZXIsXG4pOiB0cy5TdGF0ZW1lbnRbXSB7XG4gIGNvbnN0IGVudW1WYWx1ZVN0YXRlbWVudHM6IHRzLlN0YXRlbWVudFtdID0gW107XG4gIGNvbnN0IG1lbWJlck5hbWVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gIGxldCBpbmRleCA9IHN0YXRlbWVudE9mZnNldDtcbiAgZm9yICg7IGluZGV4IDwgc3RhdGVtZW50cy5sZW5ndGg7ICsraW5kZXgpIHtcbiAgICAvLyBFbnN1cmUgYWxsIHN0YXRlbWVudHMgYXJlIG9mIHRoZSBleHBlY3RlZCBmb3JtYXQgYW5kIHVzaW5nIHRoZSByaWdodCBpZGVudGlmZXIuXG4gICAgLy8gV2hlbiB3ZSBmaW5kIGEgc3RhdGVtZW50IHRoYXQgaXNuJ3QgcGFydCBvZiB0aGUgZW51bSwgcmV0dXJuIHdoYXQgd2UgY29sbGVjdGVkIHNvIGZhci5cbiAgICBjb25zdCBjdXJyZW50ID0gc3RhdGVtZW50c1tpbmRleF07XG4gICAgaWYgKCF0cy5pc0V4cHJlc3Npb25TdGF0ZW1lbnQoY3VycmVudCkgfHwgIXRzLmlzQmluYXJ5RXhwcmVzc2lvbihjdXJyZW50LmV4cHJlc3Npb24pKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBjb25zdCBwcm9wZXJ0eSA9IGN1cnJlbnQuZXhwcmVzc2lvbi5sZWZ0O1xuICAgIGlmICghcHJvcGVydHkgfHwgIXRzLmlzUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKHByb3BlcnR5KSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKCF0cy5pc0lkZW50aWZpZXIocHJvcGVydHkuZXhwcmVzc2lvbikgfHwgcHJvcGVydHkuZXhwcmVzc2lvbi50ZXh0ICE9PSBuYW1lKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBtZW1iZXJOYW1lcy5wdXNoKHByb3BlcnR5Lm5hbWUudGV4dCk7XG4gICAgZW51bVZhbHVlU3RhdGVtZW50cy5wdXNoKGN1cnJlbnQpO1xuICB9XG5cbiAgaWYgKGVudW1WYWx1ZVN0YXRlbWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgY29uc3QgZW51bU5hbWVTdGF0ZW1lbnRzID0gZmluZEVudW1OYW1lU3RhdGVtZW50cyhuYW1lLCBzdGF0ZW1lbnRzLCBpbmRleCwgbWVtYmVyTmFtZXMpO1xuICBpZiAoZW51bU5hbWVTdGF0ZW1lbnRzLmxlbmd0aCAhPT0gZW51bVZhbHVlU3RhdGVtZW50cy5sZW5ndGgpIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICByZXR1cm4gZW51bVZhbHVlU3RhdGVtZW50cy5jb25jYXQoZW51bU5hbWVTdGF0ZW1lbnRzKTtcbn1cblxuLy8gVHNpY2tsZSBlbnVtcyBoYXZlIGEgdmFyaWFibGUgc3RhdGVtZW50IHdpdGggaW5kZXhlcywgZm9sbG93ZWQgYnkgdmFsdWUgc3RhdGVtZW50cy5cbi8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vYW5ndWxhci9kZXZraXQvaXNzdWVzLzIyOSNpc3N1ZWNvbW1lbnQtMzM4NTEyMDU2IGZvcmUgbW9yZSBpbmZvcm1hdGlvbi5cbmZ1bmN0aW9uIGZpbmRFbnVtTmFtZVN0YXRlbWVudHMoXG4gIG5hbWU6IHN0cmluZyxcbiAgc3RhdGVtZW50czogdHMuTm9kZUFycmF5PHRzLlN0YXRlbWVudD4sXG4gIHN0YXRlbWVudE9mZnNldDogbnVtYmVyLFxuICBtZW1iZXJOYW1lcz86IHN0cmluZ1tdLFxuKTogdHMuU3RhdGVtZW50W10ge1xuICBjb25zdCBlbnVtU3RhdGVtZW50czogdHMuU3RhdGVtZW50W10gPSBbXTtcblxuICBmb3IgKGxldCBpbmRleCA9IHN0YXRlbWVudE9mZnNldDsgaW5kZXggPCBzdGF0ZW1lbnRzLmxlbmd0aDsgKytpbmRleCkge1xuICAgIC8vIEVuc3VyZSBhbGwgc3RhdGVtZW50cyBhcmUgb2YgdGhlIGV4cGVjdGVkIGZvcm1hdCBhbmQgdXNpbmcgdGhlIHJpZ2h0IGlkZW50aWZlci5cbiAgICAvLyBXaGVuIHdlIGZpbmQgYSBzdGF0ZW1lbnQgdGhhdCBpc24ndCBwYXJ0IG9mIHRoZSBlbnVtLCByZXR1cm4gd2hhdCB3ZSBjb2xsZWN0ZWQgc28gZmFyLlxuICAgIGNvbnN0IGN1cnJlbnQgPSBzdGF0ZW1lbnRzW2luZGV4XTtcbiAgICBpZiAoIXRzLmlzRXhwcmVzc2lvblN0YXRlbWVudChjdXJyZW50KSB8fCAhdHMuaXNCaW5hcnlFeHByZXNzaW9uKGN1cnJlbnQuZXhwcmVzc2lvbikpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGNvbnN0IGFjY2VzcyA9IGN1cnJlbnQuZXhwcmVzc2lvbi5sZWZ0O1xuICAgIGNvbnN0IHZhbHVlID0gY3VycmVudC5leHByZXNzaW9uLnJpZ2h0O1xuICAgIGlmICghYWNjZXNzIHx8ICF0cy5pc0VsZW1lbnRBY2Nlc3NFeHByZXNzaW9uKGFjY2VzcykgfHwgIXZhbHVlIHx8ICF0cy5pc1N0cmluZ0xpdGVyYWwodmFsdWUpKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBpZiAobWVtYmVyTmFtZXMgJiYgIW1lbWJlck5hbWVzLmluY2x1ZGVzKHZhbHVlLnRleHQpKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoIXRzLmlzSWRlbnRpZmllcihhY2Nlc3MuZXhwcmVzc2lvbikgfHwgYWNjZXNzLmV4cHJlc3Npb24udGV4dCAhPT0gbmFtZSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKCFhY2Nlc3MuYXJndW1lbnRFeHByZXNzaW9uIHx8ICF0cy5pc1Byb3BlcnR5QWNjZXNzRXhwcmVzc2lvbihhY2Nlc3MuYXJndW1lbnRFeHByZXNzaW9uKSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgY29uc3QgZW51bUV4cHJlc3Npb24gPSBhY2Nlc3MuYXJndW1lbnRFeHByZXNzaW9uLmV4cHJlc3Npb247XG4gICAgaWYgKCF0cy5pc0lkZW50aWZpZXIoZW51bUV4cHJlc3Npb24pIHx8IGVudW1FeHByZXNzaW9uLnRleHQgIT09IG5hbWUpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGlmICh2YWx1ZS50ZXh0ICE9PSBhY2Nlc3MuYXJndW1lbnRFeHByZXNzaW9uLm5hbWUudGV4dCkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgZW51bVN0YXRlbWVudHMucHVzaChjdXJyZW50KTtcbiAgfVxuXG4gIHJldHVybiBlbnVtU3RhdGVtZW50cztcbn1cblxuZnVuY3Rpb24gYWRkUHVyZUNvbW1lbnQ8VCBleHRlbmRzIHRzLk5vZGU+KG5vZGU6IFQpOiBUIHtcbiAgY29uc3QgcHVyZUZ1bmN0aW9uQ29tbWVudCA9ICdAX19QVVJFX18nO1xuXG4gIHJldHVybiB0cy5hZGRTeW50aGV0aWNMZWFkaW5nQ29tbWVudChcbiAgICBub2RlLFxuICAgIHRzLlN5bnRheEtpbmQuTXVsdGlMaW5lQ29tbWVudFRyaXZpYSxcbiAgICBwdXJlRnVuY3Rpb25Db21tZW50LFxuICAgIGZhbHNlLFxuICApO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVIb3N0Tm9kZShcbiAgaG9zdE5vZGU6IHRzLlZhcmlhYmxlU3RhdGVtZW50LFxuICBleHByZXNzaW9uOiB0cy5FeHByZXNzaW9uLFxuKTogdHMuU3RhdGVtZW50IHtcblxuICAvLyBVcGRhdGUgZXhpc3RpbmcgaG9zdCBub2RlIHdpdGggdGhlIHB1cmUgY29tbWVudCBiZWZvcmUgdGhlIHZhcmlhYmxlIGRlY2xhcmF0aW9uIGluaXRpYWxpemVyLlxuICBjb25zdCB2YXJpYWJsZURlY2xhcmF0aW9uID0gaG9zdE5vZGUuZGVjbGFyYXRpb25MaXN0LmRlY2xhcmF0aW9uc1swXTtcbiAgY29uc3Qgb3V0ZXJWYXJTdG10ID0gdHMudXBkYXRlVmFyaWFibGVTdGF0ZW1lbnQoXG4gICAgaG9zdE5vZGUsXG4gICAgaG9zdE5vZGUubW9kaWZpZXJzLFxuICAgIHRzLnVwZGF0ZVZhcmlhYmxlRGVjbGFyYXRpb25MaXN0KFxuICAgICAgaG9zdE5vZGUuZGVjbGFyYXRpb25MaXN0LFxuICAgICAgW1xuICAgICAgICB0cy51cGRhdGVWYXJpYWJsZURlY2xhcmF0aW9uKFxuICAgICAgICAgIHZhcmlhYmxlRGVjbGFyYXRpb24sXG4gICAgICAgICAgdmFyaWFibGVEZWNsYXJhdGlvbi5uYW1lLFxuICAgICAgICAgIHZhcmlhYmxlRGVjbGFyYXRpb24udHlwZSxcbiAgICAgICAgICBleHByZXNzaW9uLFxuICAgICAgICApLFxuICAgICAgXSxcbiAgICApLFxuICApO1xuXG4gIHJldHVybiBvdXRlclZhclN0bXQ7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUVudW1JaWZlKFxuICBob3N0Tm9kZTogdHMuVmFyaWFibGVTdGF0ZW1lbnQsXG4gIGlpZmU6IHRzLkNhbGxFeHByZXNzaW9uLFxuICBleHBvcnRBc3NpZ25tZW50PzogdHMuRXhwcmVzc2lvbixcbik6IHRzLlN0YXRlbWVudCB7XG4gIGlmICghdHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbihpaWZlLmV4cHJlc3Npb24pXG4gICAgICB8fCAhdHMuaXNGdW5jdGlvbkV4cHJlc3Npb24oaWlmZS5leHByZXNzaW9uLmV4cHJlc3Npb24pKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIElJRkUgU3RydWN0dXJlJyk7XG4gIH1cblxuICAvLyBJZ25vcmUgZXhwb3J0IGFzc2lnbm1lbnQgaWYgdmFyaWFibGUgaXMgZGlyZWN0bHkgZXhwb3J0ZWRcbiAgaWYgKGhvc3ROb2RlLm1vZGlmaWVyc1xuICAgICAgJiYgaG9zdE5vZGUubW9kaWZpZXJzLmZpbmRJbmRleChtID0+IG0ua2luZCA9PSB0cy5TeW50YXhLaW5kLkV4cG9ydEtleXdvcmQpICE9IC0xKSB7XG4gICAgZXhwb3J0QXNzaWdubWVudCA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGNvbnN0IGV4cHJlc3Npb24gPSBpaWZlLmV4cHJlc3Npb24uZXhwcmVzc2lvbjtcbiAgY29uc3QgdXBkYXRlZEZ1bmN0aW9uID0gdHMudXBkYXRlRnVuY3Rpb25FeHByZXNzaW9uKFxuICAgIGV4cHJlc3Npb24sXG4gICAgZXhwcmVzc2lvbi5tb2RpZmllcnMsXG4gICAgZXhwcmVzc2lvbi5hc3Rlcmlza1Rva2VuLFxuICAgIGV4cHJlc3Npb24ubmFtZSxcbiAgICBleHByZXNzaW9uLnR5cGVQYXJhbWV0ZXJzLFxuICAgIGV4cHJlc3Npb24ucGFyYW1ldGVycyxcbiAgICBleHByZXNzaW9uLnR5cGUsXG4gICAgdHMudXBkYXRlQmxvY2soXG4gICAgICBleHByZXNzaW9uLmJvZHksXG4gICAgICBbXG4gICAgICAgIC4uLmV4cHJlc3Npb24uYm9keS5zdGF0ZW1lbnRzLFxuICAgICAgICB0cy5jcmVhdGVSZXR1cm4oZXhwcmVzc2lvbi5wYXJhbWV0ZXJzWzBdLm5hbWUgYXMgdHMuSWRlbnRpZmllciksXG4gICAgICBdLFxuICAgICksXG4gICk7XG5cbiAgbGV0IGFyZzogdHMuRXhwcmVzc2lvbiA9IHRzLmNyZWF0ZU9iamVjdExpdGVyYWwoKTtcbiAgaWYgKGV4cG9ydEFzc2lnbm1lbnQpIHtcbiAgICBhcmcgPSB0cy5jcmVhdGVCaW5hcnkoZXhwb3J0QXNzaWdubWVudCwgdHMuU3ludGF4S2luZC5CYXJCYXJUb2tlbiwgYXJnKTtcbiAgfVxuICBjb25zdCB1cGRhdGVkSWlmZSA9IHRzLnVwZGF0ZUNhbGwoXG4gICAgaWlmZSxcbiAgICB0cy51cGRhdGVQYXJlbihcbiAgICAgIGlpZmUuZXhwcmVzc2lvbixcbiAgICAgIHVwZGF0ZWRGdW5jdGlvbixcbiAgICApLFxuICAgIGlpZmUudHlwZUFyZ3VtZW50cyxcbiAgICBbYXJnXSxcbiAgKTtcblxuICBsZXQgdmFsdWU6IHRzLkV4cHJlc3Npb24gPSBhZGRQdXJlQ29tbWVudCh1cGRhdGVkSWlmZSk7XG4gIGlmIChleHBvcnRBc3NpZ25tZW50KSB7XG4gICAgdmFsdWUgPSB0cy5jcmVhdGVCaW5hcnkoXG4gICAgICBleHBvcnRBc3NpZ25tZW50LFxuICAgICAgdHMuU3ludGF4S2luZC5GaXJzdEFzc2lnbm1lbnQsXG4gICAgICB1cGRhdGVkSWlmZSk7XG4gIH1cblxuICByZXR1cm4gdXBkYXRlSG9zdE5vZGUoaG9zdE5vZGUsIHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlV3JhcHBlZEVudW0oXG4gIG5hbWU6IHN0cmluZyxcbiAgaG9zdE5vZGU6IHRzLlZhcmlhYmxlU3RhdGVtZW50LFxuICBzdGF0ZW1lbnRzOiBBcnJheTx0cy5TdGF0ZW1lbnQ+LFxuICBsaXRlcmFsSW5pdGlhbGl6ZXI6IHRzLk9iamVjdExpdGVyYWxFeHByZXNzaW9uIHwgdW5kZWZpbmVkLFxuKTogdHMuU3RhdGVtZW50IHtcbiAgbGl0ZXJhbEluaXRpYWxpemVyID0gbGl0ZXJhbEluaXRpYWxpemVyIHx8IHRzLmNyZWF0ZU9iamVjdExpdGVyYWwoKTtcbiAgY29uc3QgaW5uZXJWYXJTdG10ID0gdHMuY3JlYXRlVmFyaWFibGVTdGF0ZW1lbnQoXG4gICAgdW5kZWZpbmVkLFxuICAgIHRzLmNyZWF0ZVZhcmlhYmxlRGVjbGFyYXRpb25MaXN0KFtcbiAgICAgIHRzLmNyZWF0ZVZhcmlhYmxlRGVjbGFyYXRpb24obmFtZSwgdW5kZWZpbmVkLCBsaXRlcmFsSW5pdGlhbGl6ZXIpLFxuICAgIF0pLFxuICApO1xuXG4gIGNvbnN0IGlubmVyUmV0dXJuID0gdHMuY3JlYXRlUmV0dXJuKHRzLmNyZWF0ZUlkZW50aWZpZXIobmFtZSkpO1xuXG4gIGNvbnN0IGlpZmUgPSB0cy5jcmVhdGVJbW1lZGlhdGVseUludm9rZWRGdW5jdGlvbkV4cHJlc3Npb24oW1xuICAgIGlubmVyVmFyU3RtdCxcbiAgICAuLi5zdGF0ZW1lbnRzLFxuICAgIGlubmVyUmV0dXJuLFxuICBdKTtcblxuICByZXR1cm4gdXBkYXRlSG9zdE5vZGUoaG9zdE5vZGUsIGFkZFB1cmVDb21tZW50KHRzLmNyZWF0ZVBhcmVuKGlpZmUpKSk7XG59XG4iXX0=