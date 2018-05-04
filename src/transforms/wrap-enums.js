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
                        updatedStatements.splice(uIndex, 2, updateEnumIife(currentStatement, iife));
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
    const argument = expression.arguments[0];
    if (!ts.isBinaryExpression(argument)
        || argument.operatorToken.kind !== ts.SyntaxKind.BarBarToken) {
        return null;
    }
    if (!ts.isIdentifier(argument.left) || argument.left.text !== name) {
        return null;
    }
    expression = expression.expression;
    while (ts.isParenthesizedExpression(expression)) {
        expression = expression.expression;
    }
    if (!expression || !ts.isFunctionExpression(expression) || expression.parameters.length !== 1) {
        return null;
    }
    const parameter = expression.parameters[0];
    if (!ts.isIdentifier(parameter.name) || parameter.name.text !== name) {
        return null;
    }
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
        if (!ts.isIdentifier(assignment.expression) || assignment.expression.text !== name) {
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
            || memberArgument.left.expression.text !== name) {
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
    return callExpression;
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
function updateHostNode(hostNode, expression) {
    const pureFunctionComment = '@__PURE__';
    // Update existing host node with the pure comment before the variable declaration initializer.
    const variableDeclaration = hostNode.declarationList.declarations[0];
    const outerVarStmt = ts.updateVariableStatement(hostNode, hostNode.modifiers, ts.updateVariableDeclarationList(hostNode.declarationList, [
        ts.updateVariableDeclaration(variableDeclaration, variableDeclaration.name, variableDeclaration.type, ts.addSyntheticLeadingComment(expression, ts.SyntaxKind.MultiLineCommentTrivia, pureFunctionComment, false)),
    ]));
    return outerVarStmt;
}
function updateEnumIife(hostNode, iife) {
    if (!ts.isParenthesizedExpression(iife.expression)
        || !ts.isFunctionExpression(iife.expression.expression)) {
        throw new Error('Invalid IIFE Structure');
    }
    const expression = iife.expression.expression;
    const updatedFunction = ts.updateFunctionExpression(expression, expression.modifiers, expression.asteriskToken, expression.name, expression.typeParameters, expression.parameters, expression.type, ts.updateBlock(expression.body, [
        ...expression.body.statements,
        ts.createReturn(expression.parameters[0].name),
    ]));
    const updatedIife = ts.updateCall(iife, ts.updateParen(iife.expression, updatedFunction), iife.typeArguments, [ts.createObjectLiteral()]);
    return updateHostNode(hostNode, updatedIife);
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
    return updateHostNode(hostNode, ts.createParen(iife));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid3JhcC1lbnVtcy5qcyIsInNvdXJjZVJvb3QiOiIuLyIsInNvdXJjZXMiOlsicGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYnVpbGRfb3B0aW1pemVyL3NyYy90cmFuc2Zvcm1zL3dyYXAtZW51bXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7Ozs7O0dBTUc7QUFDSCxpQ0FBaUM7QUFFakMscUJBQXFCLElBQWE7SUFDaEMsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxLQUFLO1dBQ2pDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxXQUFXO1dBQ3ZDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxVQUFVO1dBQ3RDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhO1dBQ3pDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUM7QUFDaEQsQ0FBQztBQUVEO0lBQ0UsTUFBTSxDQUFDLENBQUMsT0FBaUMsRUFBaUMsRUFBRTtRQUMxRSxNQUFNLFdBQVcsR0FBa0MsQ0FBQyxFQUFpQixFQUFFLEVBQUU7WUFFdkUsTUFBTSxNQUFNLEdBQUcsb0JBQW9CLENBQUMsRUFBRSxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUU1RCxNQUFNLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUM3RSxDQUFDLENBQUM7UUFFRixNQUFNLENBQUMsV0FBVyxDQUFDO0lBQ3JCLENBQUMsQ0FBQztBQUNKLENBQUM7QUFYRCwwREFXQztBQUVELDhCQUNFLFVBQXNDLEVBQ3RDLE9BQWlDO0lBR2pDLGlEQUFpRDtJQUNqRCxJQUFJLGlCQUFrRCxDQUFDO0lBRXZELE1B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QUFDLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsS0FBSyxJQUFJLENBQUMsRUFBRSxDQUFDLGVBQWUsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDN0YsS0FBSyxDQUFDO1FBQ1IsQ0FBQztRQUVELEVBQUUsQ0FBQyxDQUFDLFdBQVcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztZQUNyRCxLQUFLLENBQUM7UUFDUixDQUFDO1FBRUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxVQUFVLENBQUMsSUFBSSxNQUFNLENBQUMsVUFBVSxDQUFDLElBQUksS0FBSyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQzNFLEtBQUssQ0FBQztRQUNSLENBQUM7UUFFRCxFQUFFLENBQUMsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxrQkFBa0IsSUFBSSxDQUFDLEVBQUUsQ0FBQywwQkFBMEIsQ0FBQyxNQUFNLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDNUYsS0FBSyxDQUFDO1FBQ1IsQ0FBQztRQUVELE1BQU0sY0FBYyxHQUFHLE1BQU0sQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQUM7UUFDNUQsRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxJQUFJLGNBQWMsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDLENBQUMsQ0FBQztZQUNyRSxLQUFLLENBQUM7UUFDUixDQUFDO1FBRUQsRUFBRSxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksS0FBSyxNQUFNLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7WUFDdkQsS0FBSyxDQUFDO1FBQ1IsQ0FBQztRQUVELGNBQWMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDL0IsQ0FBQztJ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QUcsVUFBVTtRQUNiLFdBQVc7S0FDWixDQUFDLENBQUM7SUFFSCxNQUFNLENBQUMsY0FBYyxDQUFDLFFBQVEsRUFBRSxFQUFFLENBQUMsV0FBVyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7QUFDeEQsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgSW5jLiBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cbmltcG9ydCAqIGFzIHRzIGZyb20gJ3R5cGVzY3JpcHQnO1xuXG5mdW5jdGlvbiBpc0Jsb2NrTGlrZShub2RlOiB0cy5Ob2RlKTogbm9kZSBpcyB0cy5CbG9ja0xpa2Uge1xuICByZXR1cm4gbm9kZS5raW5kID09PSB0cy5TeW50YXhLaW5kLkJsb2NrXG4gICAgICB8fCBub2RlLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuTW9kdWxlQmxvY2tcbiAgICAgIHx8IG5vZGUua2luZCA9PT0gdHMuU3ludGF4S2luZC5DYXNlQ2xhdXNlXG4gICAgICB8fCBub2RlLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuRGVmYXVsdENsYXVzZVxuICAgICAgfHwgbm9kZS5raW5kID09PSB0cy5TeW50YXhLaW5kLlNvdXJjZUZpbGU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRXcmFwRW51bXNUcmFuc2Zvcm1lcigpOiB0cy5UcmFuc2Zvcm1lckZhY3Rvcnk8dHMuU291cmNlRmlsZT4ge1xuICByZXR1cm4gKGNvbnRleHQ6IHRzLlRyYW5zZm9ybWF0aW9uQ29udGV4dCk6IHRzLlRyYW5zZm9ybWVyPHRzLlNvdXJjZUZpbGU+ID0+IHtcbiAgICBjb25zdCB0cmFuc2Zvcm1lcjogdHMuVHJhbnNmb3JtZXI8dHMuU291cmNlRmlsZT4gPSAoc2Y6IHRzLlNvdXJjZUZpbGUpID0+IHtcblxuICAgICAgY29uc3QgcmVzdWx0ID0gdmlzaXRCbG9ja1N0YXRlbWVudHMoc2Yuc3RhdGVtZW50cywgY29udGV4dCk7XG5cbiAgICAgIHJldHVybiB0cy51cGRhdGVTb3VyY2VGaWxlTm9kZShzZiwgdHMuc2V0VGV4dFJhbmdlKHJlc3VsdCwgc2Yuc3RhdGVtZW50cykpO1xuICAgIH07XG5cbiAgICByZXR1cm4gdHJhbnNmb3JtZXI7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHZpc2l0QmxvY2tTdGF0ZW1lbnRzKFxuICBzdGF0ZW1lbnRzOiB0cy5Ob2RlQXJyYXk8dHMuU3RhdGVtZW50PixcbiAgY29udGV4dDogdHMuVHJhbnNmb3JtYXRpb25Db250ZXh0LFxuKTogdHMuTm9kZUFycmF5PHRzLlN0YXRlbWVudD4ge1xuXG4gIC8vIGNvcHkgb2Ygc3RhdGVtZW50cyB0byBtb2RpZnk7IGxhenkgaW5pdGlhbGl6ZWRcbiAgbGV0IHVwZGF0ZWRTdGF0ZW1lbnRzOiBBcnJheTx0cy5TdGF0ZW1lbnQ+IHwgdW5kZWZpbmVkO1xuXG4gIGNvbnN0IHZpc2l0b3I6IHRzLlZpc2l0b3IgPSAobm9kZSkgPT4ge1xuICAgIGlmIChpc0Jsb2NrTGlrZShub2RlKSkge1xuICAgICAgbGV0IHJlc3VsdCA9IHZpc2l0QmxvY2tTdGF0ZW1lbnRzKG5vZGUuc3RhdGVtZW50cywgY29udGV4dCk7XG4gICAgICBpZiAocmVzdWx0ID09PSBub2RlLnN0YXRlbWVudHMpIHtcbiAgICAgICAgcmV0dXJuIG5vZGU7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSB0cy5zZXRUZXh0UmFuZ2UocmVzdWx0LCBub2RlLnN0YXRlbWVudHMpO1xuICAgICAgc3dpdGNoIChub2RlLmtpbmQpIHtcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkJsb2NrOlxuICAgICAgICAgIHJldHVybiB0cy51cGRhdGVCbG9jayhub2RlIGFzIHRzLkJsb2NrLCByZXN1bHQpO1xuICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuTW9kdWxlQmxvY2s6XG4gICAgICAgICAgcmV0dXJuIHRzLnVwZGF0ZU1vZHVsZUJsb2NrKG5vZGUgYXMgdHMuTW9kdWxlQmxvY2ssIHJlc3VsdCk7XG4gICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5DYXNlQ2xhdXNlOlxuICAgICAgICAgIGNvbnN0IGNsYXVzZSA9IG5vZGUgYXMgdHMuQ2FzZUNsYXVzZTtcblxuICAgICAgICAgIHJldHVybiB0cy51cGRhdGVDYXNlQ2xhdXNlKGNsYXVzZSwgY2xhdXNlLmV4cHJlc3Npb24sIHJlc3VsdCk7XG4gICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5EZWZhdWx0Q2xhdXNlOlxuICAgICAgICAgIHJldHVybiB0cy51cGRhdGVEZWZhdWx0Q2xhdXNlKG5vZGUgYXMgdHMuRGVmYXVsdENsYXVzZSwgcmVzdWx0KTtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICByZXR1cm4gbm9kZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRzLnZpc2l0RWFjaENoaWxkKG5vZGUsIHZpc2l0b3IsIGNvbnRleHQpO1xuICAgIH1cbiAgfTtcblxuICAvLyAnb0luZGV4JyBpcyB0aGUgb3JpZ2luYWwgc3RhdGVtZW50IGluZGV4OyAndUluZGV4JyBpcyB0aGUgdXBkYXRlZCBzdGF0ZW1lbnQgaW5kZXhcbiAgZm9yIChsZXQgb0luZGV4ID0gMCwgdUluZGV4ID0gMDsgb0luZGV4IDwgc3RhdGVtZW50cy5sZW5ndGg7IG9JbmRleCsrLCB1SW5kZXgrKykge1xuICAgIGNvbnN0IGN1cnJlbnRTdGF0ZW1lbnQgPSBzdGF0ZW1lbnRzW29JbmRleF07XG5cbiAgICAvLyB0aGVzZSBjYW4ndCBjb250YWluIGFuIGVudW0gZGVjbGFyYXRpb25cbiAgICBpZiAoY3VycmVudFN0YXRlbWVudC5raW5kID09PSB0cy5TeW50YXhLaW5kLkltcG9ydERlY2xhcmF0aW9uKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBlbnVtIGRlY2xhcmF0aW9ucyBtdXN0OlxuICAgIC8vICAgKiBub3QgYmUgbGFzdCBzdGF0ZW1lbnRcbiAgICAvLyAgICogYmUgYSB2YXJpYWJsZSBzdGF0ZW1lbnRcbiAgICAvLyAgICogaGF2ZSBvbmx5IG9uZSBkZWNsYXJhdGlvblxuICAgIC8vICAgKiBoYXZlIGFuIGlkZW50aWZlciBhcyBhIGRlY2xhcmF0aW9uIG5hbWVcbiAgICBpZiAob0luZGV4IDwgc3RhdGVtZW50cy5sZW5ndGggLSAxXG4gICAgICAgICYmIHRzLmlzVmFyaWFibGVTdGF0ZW1lbnQoY3VycmVudFN0YXRlbWVudClcbiAgICAgICAgJiYgY3VycmVudFN0YXRlbWVudC5kZWNsYXJhdGlvbkxpc3QuZGVjbGFyYXRpb25zLmxlbmd0aCA9PT0gMSkge1xuXG4gICAgICBjb25zdCB2YXJpYWJsZURlY2xhcmF0aW9uID0gY3VycmVudFN0YXRlbWVudC5kZWNsYXJhdGlvbkxpc3QuZGVjbGFyYXRpb25zWzBdO1xuICAgICAgaWYgKHRzLmlzSWRlbnRpZmllcih2YXJpYWJsZURlY2xhcmF0aW9uLm5hbWUpKSB7XG4gICAgICAgIGNvbnN0IG5hbWUgPSB2YXJpYWJsZURlY2xhcmF0aW9uLm5hbWUudGV4dDtcblxuICAgICAgICBpZiAoIXZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIpIHtcbiAgICAgICAgICBjb25zdCBpaWZlID0gZmluZFRzMl8zRW51bUlpZmUobmFtZSwgc3RhdGVtZW50c1tvSW5kZXggKyAxXSk7XG4gICAgICAgICAgaWYgKGlpZmUpIHtcbiAgICAgICAgICAgIC8vIGZvdW5kIGFuIGVudW1cbiAgICAgICAgICAgIGlmICghdXBkYXRlZFN0YXRlbWVudHMpIHtcbiAgICAgICAgICAgICAgdXBkYXRlZFN0YXRlbWVudHMgPSBzdGF0ZW1lbnRzLnNsaWNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB1cGRhdGUgSUlGRSBhbmQgcmVwbGFjZSB2YXJpYWJsZSBzdGF0ZW1lbnQgYW5kIG9sZCBJSUZFXG4gICAgICAgICAgICB1cGRhdGVkU3RhdGVtZW50cy5zcGxpY2UodUluZGV4LCAyLCB1cGRhdGVFbnVtSWlmZShcbiAgICAgICAgICAgICAgY3VycmVudFN0YXRlbWVudCxcbiAgICAgICAgICAgICAgaWlmZSxcbiAgICAgICAgICAgICkpO1xuICAgICAgICAgICAgLy8gc2tpcCBJSUZFIHN0YXRlbWVudFxuICAgICAgICAgICAgb0luZGV4Kys7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodHMuaXNPYmplY3RMaXRlcmFsRXhwcmVzc2lvbih2YXJpYWJsZURlY2xhcmF0aW9uLmluaXRpYWxpemVyKVxuICAgICAgICAgICAgICAgICAgICYmIHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIucHJvcGVydGllcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zdCBlbnVtU3RhdGVtZW50cyA9IGZpbmRUczJfMkVudW1TdGF0ZW1lbnRzKG5hbWUsIHN0YXRlbWVudHMsIG9JbmRleCArIDEpO1xuICAgICAgICAgIGlmIChlbnVtU3RhdGVtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAvLyBmb3VuZCBhbiBlbnVtXG4gICAgICAgICAgICBpZiAoIXVwZGF0ZWRTdGF0ZW1lbnRzKSB7XG4gICAgICAgICAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzID0gc3RhdGVtZW50cy5zbGljZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gY3JlYXRlIHdyYXBwZXIgYW5kIHJlcGxhY2UgdmFyaWFibGUgc3RhdGVtZW50IGFuZCBlbnVtIG1lbWJlciBzdGF0ZW1lbnRzXG4gICAgICAgICAgICB1cGRhdGVkU3RhdGVtZW50cy5zcGxpY2UodUluZGV4LCBlbnVtU3RhdGVtZW50cy5sZW5ndGggKyAxLCBjcmVhdGVXcmFwcGVkRW51bShcbiAgICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgICAgY3VycmVudFN0YXRlbWVudCxcbiAgICAgICAgICAgICAgZW51bVN0YXRlbWVudHMsXG4gICAgICAgICAgICAgIHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIsXG4gICAgICAgICAgICApKTtcbiAgICAgICAgICAgIC8vIHNraXAgZW51bSBtZW1iZXIgZGVjbGFyYXRpb25zXG4gICAgICAgICAgICBvSW5kZXggKz0gZW51bVN0YXRlbWVudHMubGVuZ3RoO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHRzLmlzT2JqZWN0TGl0ZXJhbEV4cHJlc3Npb24odmFyaWFibGVEZWNsYXJhdGlvbi5pbml0aWFsaXplcilcbiAgICAgICAgICAmJiB2YXJpYWJsZURlY2xhcmF0aW9uLmluaXRpYWxpemVyLnByb3BlcnRpZXMubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgICAgY29uc3QgbGl0ZXJhbFByb3BlcnR5Q291bnQgPSB2YXJpYWJsZURlY2xhcmF0aW9uLmluaXRpYWxpemVyLnByb3BlcnRpZXMubGVuZ3RoO1xuICAgICAgICAgIGNvbnN0IGVudW1TdGF0ZW1lbnRzID0gZmluZEVudW1OYW1lU3RhdGVtZW50cyhuYW1lLCBzdGF0ZW1lbnRzLCBvSW5kZXggKyAxKTtcbiAgICAgICAgICBpZiAoZW51bVN0YXRlbWVudHMubGVuZ3RoID09PSBsaXRlcmFsUHJvcGVydHlDb3VudCkge1xuICAgICAgICAgICAgLy8gZm91bmQgYW4gZW51bVxuICAgICAgICAgICAgaWYgKCF1cGRhdGVkU3RhdGVtZW50cykge1xuICAgICAgICAgICAgICB1cGRhdGVkU3RhdGVtZW50cyA9IHN0YXRlbWVudHMuc2xpY2UoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIGNyZWF0ZSB3cmFwcGVyIGFuZCByZXBsYWNlIHZhcmlhYmxlIHN0YXRlbWVudCBhbmQgZW51bSBtZW1iZXIgc3RhdGVtZW50c1xuICAgICAgICAgICAgdXBkYXRlZFN0YXRlbWVudHMuc3BsaWNlKHVJbmRleCwgZW51bVN0YXRlbWVudHMubGVuZ3RoICsgMSwgY3JlYXRlV3JhcHBlZEVudW0oXG4gICAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICAgIGN1cnJlbnRTdGF0ZW1lbnQsXG4gICAgICAgICAgICAgIGVudW1TdGF0ZW1lbnRzLFxuICAgICAgICAgICAgICB2YXJpYWJsZURlY2xhcmF0aW9uLmluaXRpYWxpemVyLFxuICAgICAgICAgICAgKSk7XG4gICAgICAgICAgICAvLyBza2lwIGVudW0gbWVtYmVyIGRlY2xhcmF0aW9uc1xuICAgICAgICAgICAgb0luZGV4ICs9IGVudW1TdGF0ZW1lbnRzLmxlbmd0aDtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IHJlc3VsdCA9IHRzLnZpc2l0Tm9kZShjdXJyZW50U3RhdGVtZW50LCB2aXNpdG9yKTtcbiAgICBpZiAocmVzdWx0ICE9PSBjdXJyZW50U3RhdGVtZW50KSB7XG4gICAgICBpZiAoIXVwZGF0ZWRTdGF0ZW1lbnRzKSB7XG4gICAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzID0gc3RhdGVtZW50cy5zbGljZSgpO1xuICAgICAgfVxuICAgICAgdXBkYXRlZFN0YXRlbWVudHNbdUluZGV4XSA9IHJlc3VsdDtcbiAgICB9XG4gIH1cblxuICAvLyBpZiBjaGFuZ2VzLCByZXR1cm4gdXBkYXRlZCBzdGF0ZW1lbnRzXG4gIC8vIG90aGVyd2lzZSwgcmV0dXJuIG9yaWdpbmFsIGFycmF5IGluc3RhbmNlXG4gIHJldHVybiB1cGRhdGVkU3RhdGVtZW50cyA/IHRzLmNyZWF0ZU5vZGVBcnJheSh1cGRhdGVkU3RhdGVtZW50cykgOiBzdGF0ZW1lbnRzO1xufVxuXG4vLyBUUyAyLjMgZW51bXMgaGF2ZSBzdGF0ZW1lbnRzIHRoYXQgYXJlIGluc2lkZSBhIElJRkUuXG5mdW5jdGlvbiBmaW5kVHMyXzNFbnVtSWlmZShuYW1lOiBzdHJpbmcsIHN0YXRlbWVudDogdHMuU3RhdGVtZW50KTogdHMuQ2FsbEV4cHJlc3Npb24gfCBudWxsIHtcbiAgaWYgKCF0cy5pc0V4cHJlc3Npb25TdGF0ZW1lbnQoc3RhdGVtZW50KSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgbGV0IGV4cHJlc3Npb24gPSBzdGF0ZW1lbnQuZXhwcmVzc2lvbjtcbiAgd2hpbGUgKHRzLmlzUGFyZW50aGVzaXplZEV4cHJlc3Npb24oZXhwcmVzc2lvbikpIHtcbiAgICBleHByZXNzaW9uID0gZXhwcmVzc2lvbi5leHByZXNzaW9uO1xuICB9XG5cbiAgaWYgKCFleHByZXNzaW9uIHx8ICF0cy5pc0NhbGxFeHByZXNzaW9uKGV4cHJlc3Npb24pIHx8IGV4cHJlc3Npb24uYXJndW1lbnRzLmxlbmd0aCAhPT0gMSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3QgY2FsbEV4cHJlc3Npb24gPSBleHByZXNzaW9uO1xuXG4gIGNvbnN0IGFyZ3VtZW50ID0gZXhwcmVzc2lvbi5hcmd1bWVudHNbMF07XG4gIGlmICghdHMuaXNCaW5hcnlFeHByZXNzaW9uKGFyZ3VtZW50KVxuICAgICAgfHwgYXJndW1lbnQub3BlcmF0b3JUb2tlbi5raW5kICE9PSB0cy5TeW50YXhLaW5kLkJhckJhclRva2VuKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBpZiAoIXRzLmlzSWRlbnRpZmllcihhcmd1bWVudC5sZWZ0KSB8fCBhcmd1bWVudC5sZWZ0LnRleHQgIT09IG5hbWUpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGV4cHJlc3Npb24gPSBleHByZXNzaW9uLmV4cHJlc3Npb247XG4gIHdoaWxlICh0cy5pc1BhcmVudGhlc2l6ZWRFeHByZXNzaW9uKGV4cHJlc3Npb24pKSB7XG4gICAgZXhwcmVzc2lvbiA9IGV4cHJlc3Npb24uZXhwcmVzc2lvbjtcbiAgfVxuXG4gIGlmICghZXhwcmVzc2lvbiB8fCAhdHMuaXNGdW5jdGlvbkV4cHJlc3Npb24oZXhwcmVzc2lvbikgfHwgZXhwcmVzc2lvbi5wYXJhbWV0ZXJzLmxlbmd0aCAhPT0gMSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3QgcGFyYW1ldGVyID0gZXhwcmVzc2lvbi5wYXJhbWV0ZXJzWzBdO1xuICBpZiAoIXRzLmlzSWRlbnRpZmllcihwYXJhbWV0ZXIubmFtZSkgfHwgcGFyYW1ldGVyLm5hbWUudGV4dCAhPT0gbmFtZSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgLy8gSW4gVFMgMi4zIGVudW1zLCB0aGUgSUlGRSBjb250YWlucyBvbmx5IGV4cHJlc3Npb25zIHdpdGggYSBjZXJ0YWluIGZvcm1hdC5cbiAgLy8gSWYgd2UgZmluZCBhbnkgdGhhdCBpcyBkaWZmZXJlbnQsIHdlIGlnbm9yZSB0aGUgd2hvbGUgdGhpbmcuXG4gIGZvciAobGV0IGJvZHlJbmRleCA9IDA7IGJvZHlJbmRleCA8IGV4cHJlc3Npb24uYm9keS5zdGF0ZW1lbnRzLmxlbmd0aDsgKytib2R5SW5kZXgpIHtcbiAgICBjb25zdCBib2R5U3RhdGVtZW50ID0gZXhwcmVzc2lvbi5ib2R5LnN0YXRlbWVudHNbYm9keUluZGV4XTtcblxuICAgIGlmICghdHMuaXNFeHByZXNzaW9uU3RhdGVtZW50KGJvZHlTdGF0ZW1lbnQpIHx8ICFib2R5U3RhdGVtZW50LmV4cHJlc3Npb24pIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmICghdHMuaXNCaW5hcnlFeHByZXNzaW9uKGJvZHlTdGF0ZW1lbnQuZXhwcmVzc2lvbilcbiAgICAgICAgfHwgYm9keVN0YXRlbWVudC5leHByZXNzaW9uLm9wZXJhdG9yVG9rZW4ua2luZCAhPT0gdHMuU3ludGF4S2luZC5GaXJzdEFzc2lnbm1lbnQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IGFzc2lnbm1lbnQgPSBib2R5U3RhdGVtZW50LmV4cHJlc3Npb24ubGVmdDtcbiAgICBjb25zdCB2YWx1ZSA9IGJvZHlTdGF0ZW1lbnQuZXhwcmVzc2lvbi5yaWdodDtcbiAgICBpZiAoIXRzLmlzRWxlbWVudEFjY2Vzc0V4cHJlc3Npb24oYXNzaWdubWVudCkgfHwgIXRzLmlzU3RyaW5nTGl0ZXJhbCh2YWx1ZSkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmICghdHMuaXNJZGVudGlmaWVyKGFzc2lnbm1lbnQuZXhwcmVzc2lvbikgfHwgYXNzaWdubWVudC5leHByZXNzaW9uLnRleHQgIT09IG5hbWUpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IG1lbWJlckFyZ3VtZW50ID0gYXNzaWdubWVudC5hcmd1bWVudEV4cHJlc3Npb247XG4gICAgaWYgKCFtZW1iZXJBcmd1bWVudCB8fCAhdHMuaXNCaW5hcnlFeHByZXNzaW9uKG1lbWJlckFyZ3VtZW50KVxuICAgICAgICB8fCBtZW1iZXJBcmd1bWVudC5vcGVyYXRvclRva2VuLmtpbmQgIT09IHRzLlN5bnRheEtpbmQuRmlyc3RBc3NpZ25tZW50KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cblxuICAgIGlmICghdHMuaXNFbGVtZW50QWNjZXNzRXhwcmVzc2lvbihtZW1iZXJBcmd1bWVudC5sZWZ0KSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaWYgKCF0cy5pc0lkZW50aWZpZXIobWVtYmVyQXJndW1lbnQubGVmdC5leHByZXNzaW9uKVxuICAgICAgICB8fCBtZW1iZXJBcmd1bWVudC5sZWZ0LmV4cHJlc3Npb24udGV4dCAhPT0gbmFtZSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaWYgKCFtZW1iZXJBcmd1bWVudC5sZWZ0LmFyZ3VtZW50RXhwcmVzc2lvblxuICAgICAgICB8fCAhdHMuaXNTdHJpbmdMaXRlcmFsKG1lbWJlckFyZ3VtZW50LmxlZnQuYXJndW1lbnRFeHByZXNzaW9uKSkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgaWYgKG1lbWJlckFyZ3VtZW50LmxlZnQuYXJndW1lbnRFeHByZXNzaW9uLnRleHQgIT09IHZhbHVlLnRleHQpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBjYWxsRXhwcmVzc2lvbjtcbn1cblxuLy8gVFMgMi4yIGVudW1zIGhhdmUgc3RhdGVtZW50cyBhZnRlciB0aGUgdmFyaWFibGUgZGVjbGFyYXRpb24sIHdpdGggaW5kZXggc3RhdGVtZW50cyBmb2xsb3dlZFxuLy8gYnkgdmFsdWUgc3RhdGVtZW50cy5cbmZ1bmN0aW9uIGZpbmRUczJfMkVudW1TdGF0ZW1lbnRzKFxuICBuYW1lOiBzdHJpbmcsXG4gIHN0YXRlbWVudHM6IHRzLk5vZGVBcnJheTx0cy5TdGF0ZW1lbnQ+LFxuICBzdGF0ZW1lbnRPZmZzZXQ6IG51bWJlcixcbik6IHRzLlN0YXRlbWVudFtdIHtcbiAgY29uc3QgZW51bVZhbHVlU3RhdGVtZW50czogdHMuU3RhdGVtZW50W10gPSBbXTtcbiAgY29uc3QgbWVtYmVyTmFtZXM6IHN0cmluZ1tdID0gW107XG5cbiAgbGV0IGluZGV4ID0gc3RhdGVtZW50T2Zmc2V0O1xuICBmb3IgKDsgaW5kZXggPCBzdGF0ZW1lbnRzLmxlbmd0aDsgKytpbmRleCkge1xuICAgIC8vIEVuc3VyZSBhbGwgc3RhdGVtZW50cyBhcmUgb2YgdGhlIGV4cGVjdGVkIGZvcm1hdCBhbmQgdXNpbmcgdGhlIHJpZ2h0IGlkZW50aWZlci5cbiAgICAvLyBXaGVuIHdlIGZpbmQgYSBzdGF0ZW1lbnQgdGhhdCBpc24ndCBwYXJ0IG9mIHRoZSBlbnVtLCByZXR1cm4gd2hhdCB3ZSBjb2xsZWN0ZWQgc28gZmFyLlxuICAgIGNvbnN0IGN1cnJlbnQgPSBzdGF0ZW1lbnRzW2luZGV4XTtcbiAgICBpZiAoIXRzLmlzRXhwcmVzc2lvblN0YXRlbWVudChjdXJyZW50KSB8fCAhdHMuaXNCaW5hcnlFeHByZXNzaW9uKGN1cnJlbnQuZXhwcmVzc2lvbikpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGNvbnN0IHByb3BlcnR5ID0gY3VycmVudC5leHByZXNzaW9uLmxlZnQ7XG4gICAgaWYgKCFwcm9wZXJ0eSB8fCAhdHMuaXNQcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24ocHJvcGVydHkpKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoIXRzLmlzSWRlbnRpZmllcihwcm9wZXJ0eS5leHByZXNzaW9uKSB8fCBwcm9wZXJ0eS5leHByZXNzaW9uLnRleHQgIT09IG5hbWUpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIG1lbWJlck5hbWVzLnB1c2gocHJvcGVydHkubmFtZS50ZXh0KTtcbiAgICBlbnVtVmFsdWVTdGF0ZW1lbnRzLnB1c2goY3VycmVudCk7XG4gIH1cblxuICBpZiAoZW51bVZhbHVlU3RhdGVtZW50cy5sZW5ndGggPT09IDApIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICBjb25zdCBlbnVtTmFtZVN0YXRlbWVudHMgPSBmaW5kRW51bU5hbWVTdGF0ZW1lbnRzKG5hbWUsIHN0YXRlbWVudHMsIGluZGV4LCBtZW1iZXJOYW1lcyk7XG4gIGlmIChlbnVtTmFtZVN0YXRlbWVudHMubGVuZ3RoICE9PSBlbnVtVmFsdWVTdGF0ZW1lbnRzLmxlbmd0aCkge1xuICAgIHJldHVybiBbXTtcbiAgfVxuXG4gIHJldHVybiBlbnVtVmFsdWVTdGF0ZW1lbnRzLmNvbmNhdChlbnVtTmFtZVN0YXRlbWVudHMpO1xufVxuXG4vLyBUc2lja2xlIGVudW1zIGhhdmUgYSB2YXJpYWJsZSBzdGF0ZW1lbnQgd2l0aCBpbmRleGVzLCBmb2xsb3dlZCBieSB2YWx1ZSBzdGF0ZW1lbnRzLlxuLy8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9hbmd1bGFyL2RldmtpdC9pc3N1ZXMvMjI5I2lzc3VlY29tbWVudC0zMzg1MTIwNTYgZm9yZSBtb3JlIGluZm9ybWF0aW9uLlxuZnVuY3Rpb24gZmluZEVudW1OYW1lU3RhdGVtZW50cyhcbiAgbmFtZTogc3RyaW5nLFxuICBzdGF0ZW1lbnRzOiB0cy5Ob2RlQXJyYXk8dHMuU3RhdGVtZW50PixcbiAgc3RhdGVtZW50T2Zmc2V0OiBudW1iZXIsXG4gIG1lbWJlck5hbWVzPzogc3RyaW5nW10sXG4pOiB0cy5TdGF0ZW1lbnRbXSB7XG4gIGNvbnN0IGVudW1TdGF0ZW1lbnRzOiB0cy5TdGF0ZW1lbnRbXSA9IFtdO1xuXG4gIGZvciAobGV0IGluZGV4ID0gc3RhdGVtZW50T2Zmc2V0OyBpbmRleCA8IHN0YXRlbWVudHMubGVuZ3RoOyArK2luZGV4KSB7XG4gICAgLy8gRW5zdXJlIGFsbCBzdGF0ZW1lbnRzIGFyZSBvZiB0aGUgZXhwZWN0ZWQgZm9ybWF0IGFuZCB1c2luZyB0aGUgcmlnaHQgaWRlbnRpZmVyLlxuICAgIC8vIFdoZW4gd2UgZmluZCBhIHN0YXRlbWVudCB0aGF0IGlzbid0IHBhcnQgb2YgdGhlIGVudW0sIHJldHVybiB3aGF0IHdlIGNvbGxlY3RlZCBzbyBmYXIuXG4gICAgY29uc3QgY3VycmVudCA9IHN0YXRlbWVudHNbaW5kZXhdO1xuICAgIGlmICghdHMuaXNFeHByZXNzaW9uU3RhdGVtZW50KGN1cnJlbnQpIHx8ICF0cy5pc0JpbmFyeUV4cHJlc3Npb24oY3VycmVudC5leHByZXNzaW9uKSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgY29uc3QgYWNjZXNzID0gY3VycmVudC5leHByZXNzaW9uLmxlZnQ7XG4gICAgY29uc3QgdmFsdWUgPSBjdXJyZW50LmV4cHJlc3Npb24ucmlnaHQ7XG4gICAgaWYgKCFhY2Nlc3MgfHwgIXRzLmlzRWxlbWVudEFjY2Vzc0V4cHJlc3Npb24oYWNjZXNzKSB8fCAhdmFsdWUgfHwgIXRzLmlzU3RyaW5nTGl0ZXJhbCh2YWx1ZSkpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGlmIChtZW1iZXJOYW1lcyAmJiAhbWVtYmVyTmFtZXMuaW5jbHVkZXModmFsdWUudGV4dCkpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGlmICghdHMuaXNJZGVudGlmaWVyKGFjY2Vzcy5leHByZXNzaW9uKSB8fCBhY2Nlc3MuZXhwcmVzc2lvbi50ZXh0ICE9PSBuYW1lKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoIWFjY2Vzcy5hcmd1bWVudEV4cHJlc3Npb24gfHwgIXRzLmlzUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKGFjY2Vzcy5hcmd1bWVudEV4cHJlc3Npb24pKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBjb25zdCBlbnVtRXhwcmVzc2lvbiA9IGFjY2Vzcy5hcmd1bWVudEV4cHJlc3Npb24uZXhwcmVzc2lvbjtcbiAgICBpZiAoIXRzLmlzSWRlbnRpZmllcihlbnVtRXhwcmVzc2lvbikgfHwgZW51bUV4cHJlc3Npb24udGV4dCAhPT0gbmFtZSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKHZhbHVlLnRleHQgIT09IGFjY2Vzcy5hcmd1bWVudEV4cHJlc3Npb24ubmFtZS50ZXh0KSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBlbnVtU3RhdGVtZW50cy5wdXNoKGN1cnJlbnQpO1xuICB9XG5cbiAgcmV0dXJuIGVudW1TdGF0ZW1lbnRzO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVIb3N0Tm9kZShob3N0Tm9kZTogdHMuVmFyaWFibGVTdGF0ZW1lbnQsIGV4cHJlc3Npb246IHRzLkV4cHJlc3Npb24pOiB0cy5TdGF0ZW1lbnQge1xuICBjb25zdCBwdXJlRnVuY3Rpb25Db21tZW50ID0gJ0BfX1BVUkVfXyc7XG5cbiAgLy8gVXBkYXRlIGV4aXN0aW5nIGhvc3Qgbm9kZSB3aXRoIHRoZSBwdXJlIGNvbW1lbnQgYmVmb3JlIHRoZSB2YXJpYWJsZSBkZWNsYXJhdGlvbiBpbml0aWFsaXplci5cbiAgY29uc3QgdmFyaWFibGVEZWNsYXJhdGlvbiA9IGhvc3ROb2RlLmRlY2xhcmF0aW9uTGlzdC5kZWNsYXJhdGlvbnNbMF07XG4gIGNvbnN0IG91dGVyVmFyU3RtdCA9IHRzLnVwZGF0ZVZhcmlhYmxlU3RhdGVtZW50KFxuICAgIGhvc3ROb2RlLFxuICAgIGhvc3ROb2RlLm1vZGlmaWVycyxcbiAgICB0cy51cGRhdGVWYXJpYWJsZURlY2xhcmF0aW9uTGlzdChcbiAgICAgIGhvc3ROb2RlLmRlY2xhcmF0aW9uTGlzdCxcbiAgICAgIFtcbiAgICAgICAgdHMudXBkYXRlVmFyaWFibGVEZWNsYXJhdGlvbihcbiAgICAgICAgICB2YXJpYWJsZURlY2xhcmF0aW9uLFxuICAgICAgICAgIHZhcmlhYmxlRGVjbGFyYXRpb24ubmFtZSxcbiAgICAgICAgICB2YXJpYWJsZURlY2xhcmF0aW9uLnR5cGUsXG4gICAgICAgICAgdHMuYWRkU3ludGhldGljTGVhZGluZ0NvbW1lbnQoXG4gICAgICAgICAgICBleHByZXNzaW9uLFxuICAgICAgICAgICAgdHMuU3ludGF4S2luZC5NdWx0aUxpbmVDb21tZW50VHJpdmlhLFxuICAgICAgICAgICAgcHVyZUZ1bmN0aW9uQ29tbWVudCxcbiAgICAgICAgICAgIGZhbHNlLFxuICAgICAgICAgICksXG4gICAgICAgICksXG4gICAgICBdLFxuICAgICksXG4gICk7XG5cbiAgcmV0dXJuIG91dGVyVmFyU3RtdDtcbn1cblxuZnVuY3Rpb24gdXBkYXRlRW51bUlpZmUoaG9zdE5vZGU6IHRzLlZhcmlhYmxlU3RhdGVtZW50LCBpaWZlOiB0cy5DYWxsRXhwcmVzc2lvbik6IHRzLlN0YXRlbWVudCB7XG4gIGlmICghdHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbihpaWZlLmV4cHJlc3Npb24pXG4gICAgICB8fCAhdHMuaXNGdW5jdGlvbkV4cHJlc3Npb24oaWlmZS5leHByZXNzaW9uLmV4cHJlc3Npb24pKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIElJRkUgU3RydWN0dXJlJyk7XG4gIH1cblxuICBjb25zdCBleHByZXNzaW9uID0gaWlmZS5leHByZXNzaW9uLmV4cHJlc3Npb247XG4gIGNvbnN0IHVwZGF0ZWRGdW5jdGlvbiA9IHRzLnVwZGF0ZUZ1bmN0aW9uRXhwcmVzc2lvbihcbiAgICBleHByZXNzaW9uLFxuICAgIGV4cHJlc3Npb24ubW9kaWZpZXJzLFxuICAgIGV4cHJlc3Npb24uYXN0ZXJpc2tUb2tlbixcbiAgICBleHByZXNzaW9uLm5hbWUsXG4gICAgZXhwcmVzc2lvbi50eXBlUGFyYW1ldGVycyxcbiAgICBleHByZXNzaW9uLnBhcmFtZXRlcnMsXG4gICAgZXhwcmVzc2lvbi50eXBlLFxuICAgIHRzLnVwZGF0ZUJsb2NrKFxuICAgICAgZXhwcmVzc2lvbi5ib2R5LFxuICAgICAgW1xuICAgICAgICAuLi5leHByZXNzaW9uLmJvZHkuc3RhdGVtZW50cyxcbiAgICAgICAgdHMuY3JlYXRlUmV0dXJuKGV4cHJlc3Npb24ucGFyYW1ldGVyc1swXS5uYW1lIGFzIHRzLklkZW50aWZpZXIpLFxuICAgICAgXSxcbiAgICApLFxuICApO1xuXG4gIGNvbnN0IHVwZGF0ZWRJaWZlID0gdHMudXBkYXRlQ2FsbChcbiAgICBpaWZlLFxuICAgIHRzLnVwZGF0ZVBhcmVuKFxuICAgICAgaWlmZS5leHByZXNzaW9uLFxuICAgICAgdXBkYXRlZEZ1bmN0aW9uLFxuICAgICksXG4gICAgaWlmZS50eXBlQXJndW1lbnRzLFxuICAgIFt0cy5jcmVhdGVPYmplY3RMaXRlcmFsKCldLFxuICApO1xuXG4gIHJldHVybiB1cGRhdGVIb3N0Tm9kZShob3N0Tm9kZSwgdXBkYXRlZElpZmUpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVXcmFwcGVkRW51bShcbiAgbmFtZTogc3RyaW5nLFxuICBob3N0Tm9kZTogdHMuVmFyaWFibGVTdGF0ZW1lbnQsXG4gIHN0YXRlbWVudHM6IEFycmF5PHRzLlN0YXRlbWVudD4sXG4gIGxpdGVyYWxJbml0aWFsaXplcjogdHMuT2JqZWN0TGl0ZXJhbEV4cHJlc3Npb24gfCB1bmRlZmluZWQsXG4pOiB0cy5TdGF0ZW1lbnQge1xuICBsaXRlcmFsSW5pdGlhbGl6ZXIgPSBsaXRlcmFsSW5pdGlhbGl6ZXIgfHwgdHMuY3JlYXRlT2JqZWN0TGl0ZXJhbCgpO1xuICBjb25zdCBpbm5lclZhclN0bXQgPSB0cy5jcmVhdGVWYXJpYWJsZVN0YXRlbWVudChcbiAgICB1bmRlZmluZWQsXG4gICAgdHMuY3JlYXRlVmFyaWFibGVEZWNsYXJhdGlvbkxpc3QoW1xuICAgICAgdHMuY3JlYXRlVmFyaWFibGVEZWNsYXJhdGlvbihuYW1lLCB1bmRlZmluZWQsIGxpdGVyYWxJbml0aWFsaXplciksXG4gICAgXSksXG4gICk7XG5cbiAgY29uc3QgaW5uZXJSZXR1cm4gPSB0cy5jcmVhdGVSZXR1cm4odHMuY3JlYXRlSWRlbnRpZmllcihuYW1lKSk7XG5cbiAgY29uc3QgaWlmZSA9IHRzLmNyZWF0ZUltbWVkaWF0ZWx5SW52b2tlZEZ1bmN0aW9uRXhwcmVzc2lvbihbXG4gICAgaW5uZXJWYXJTdG10LFxuICAgIC4uLnN0YXRlbWVudHMsXG4gICAgaW5uZXJSZXR1cm4sXG4gIF0pO1xuXG4gIHJldHVybiB1cGRhdGVIb3N0Tm9kZShob3N0Tm9kZSwgdHMuY3JlYXRlUGFyZW4oaWlmZSkpO1xufVxuIl19