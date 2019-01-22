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
        const transformer = sf => {
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
                    return ts.updateCaseClause(node, node.expression, result);
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
                    // tsickle es2015 enums first statement is an export declaration
                    const isPotentialEnumExport = ts.isExportDeclaration(statements[oIndex + 1]);
                    if (isPotentialEnumExport) {
                        // skip the export
                        oIndex++;
                    }
                    const enumStatements = findEnumNameStatements(name, statements, oIndex + 1);
                    if (enumStatements.length === literalPropertyCount) {
                        // found an enum
                        if (!updatedStatements) {
                            updatedStatements = statements.slice();
                        }
                        // create wrapper and replace variable statement and enum member statements
                        const deleteCount = enumStatements.length + (isPotentialEnumExport ? 2 : 1);
                        updatedStatements.splice(uIndex, deleteCount, createWrappedEnum(name, currentStatement, enumStatements, variableDeclaration.initializer, isPotentialEnumExport));
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
function createWrappedEnum(name, hostNode, statements, literalInitializer, addExportModifier = false) {
    literalInitializer = literalInitializer || ts.createObjectLiteral();
    const node = addExportModifier
        ? ts.updateVariableStatement(hostNode, [ts.createToken(ts.SyntaxKind.ExportKeyword)], hostNode.declarationList)
        : hostNode;
    const innerVarStmt = ts.createVariableStatement(undefined, ts.createVariableDeclarationList([
        ts.createVariableDeclaration(name, undefined, literalInitializer),
    ]));
    const innerReturn = ts.createReturn(ts.createIdentifier(name));
    const iife = ts.createImmediatelyInvokedFunctionExpression([
        innerVarStmt,
        ...statements,
        innerReturn,
    ]);
    return updateHostNode(node, addPureComment(ts.createParen(iife)));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid3JhcC1lbnVtcy5qcyIsInNvdXJjZVJvb3QiOiIuLyIsInNvdXJjZXMiOlsicGFja2FnZXMvYW5ndWxhcl9kZXZraXQvYnVpbGRfb3B0aW1pemVyL3NyYy90cmFuc2Zvcm1zL3dyYXAtZW51bXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7QUFBQTs7Ozs7O0dBTUc7QUFDSCxpQ0FBaUM7QUFFakMsU0FBUyxXQUFXLENBQUMsSUFBYTtJQUNoQyxPQUFPLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxLQUFLO1dBQ2pDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxXQUFXO1dBQ3ZDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxVQUFVO1dBQ3RDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhO1dBQ3pDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUM7QUFDaEQsQ0FBQztBQUVELFNBQWdCLHVCQUF1QjtJQUNyQyxPQUFPLENBQUMsT0FBaUMsRUFBaUMsRUFBRTtRQUMxRSxNQUFNLFdBQVcsR0FBa0MsRUFBRSxDQUFDLEVBQUU7WUFDdEQsTUFBTSxNQUFNLEdBQUcsb0JBQW9CLENBQUMsRUFBRSxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUU1RCxPQUFPLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLFlBQVksQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7UUFDN0UsQ0FBQyxDQUFDO1FBRUYsT0FBTyxXQUFXLENBQUM7SUFDckIsQ0FBQyxDQUFDO0FBQ0osQ0FBQztBQVZELDBEQVVDO0FBRUQsU0FBUyxvQkFBb0IsQ0FDM0IsVUFBc0MsRUFDdEMsT0FBaUM7SUFHakMsaURBQWlEO0lBQ2pELElBQUksaUJBQWtELENBQUM7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QUFZLEdBQUcsRUFBRSxDQUFDLHVCQUF1QixDQUM3QyxTQUFTLEVBQ1QsRUFBRSxDQUFDLDZCQUE2QixDQUFDO1FBQy9CLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLEVBQUUsU0FBUyxFQUFFLGtCQUFrQixDQUFDO0tBQ2xFLENBQUMsQ0FDSCxDQUFDO0lBRUYsTUFBTSxXQUFXLEdBQUcsRUFBRSxDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQztJQUUvRCxNQUFNLElBQUksR0FBRyxFQUFFLENBQUMsMENBQTBDLENBQUM7UUFDekQsWUFBWTtRQUNaLEdBQUcsVUFBVTtRQUNiLFdBQVc7S0FDWixDQUFDLENBQUM7SUFFSCxPQUFPLGNBQWMsQ0FBQyxJQUFJLEVBQUUsY0FBYyxDQUFDLEVBQUUsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3BFLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIEluYy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5pbXBvcnQgKiBhcyB0cyBmcm9tICd0eXBlc2NyaXB0JztcblxuZnVuY3Rpb24gaXNCbG9ja0xpa2Uobm9kZTogdHMuTm9kZSk6IG5vZGUgaXMgdHMuQmxvY2tMaWtlIHtcbiAgcmV0dXJuIG5vZGUua2luZCA9PT0gdHMuU3ludGF4S2luZC5CbG9ja1xuICAgICAgfHwgbm9kZS5raW5kID09PSB0cy5TeW50YXhLaW5kLk1vZHVsZUJsb2NrXG4gICAgICB8fCBub2RlLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuQ2FzZUNsYXVzZVxuICAgICAgfHwgbm9kZS5raW5kID09PSB0cy5TeW50YXhLaW5kLkRlZmF1bHRDbGF1c2VcbiAgICAgIHx8IG5vZGUua2luZCA9PT0gdHMuU3ludGF4S2luZC5Tb3VyY2VGaWxlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0V3JhcEVudW1zVHJhbnNmb3JtZXIoKTogdHMuVHJhbnNmb3JtZXJGYWN0b3J5PHRzLlNvdXJjZUZpbGU+IHtcbiAgcmV0dXJuIChjb250ZXh0OiB0cy5UcmFuc2Zvcm1hdGlvbkNvbnRleHQpOiB0cy5UcmFuc2Zvcm1lcjx0cy5Tb3VyY2VGaWxlPiA9PiB7XG4gICAgY29uc3QgdHJhbnNmb3JtZXI6IHRzLlRyYW5zZm9ybWVyPHRzLlNvdXJjZUZpbGU+ID0gc2YgPT4ge1xuICAgICAgY29uc3QgcmVzdWx0ID0gdmlzaXRCbG9ja1N0YXRlbWVudHMoc2Yuc3RhdGVtZW50cywgY29udGV4dCk7XG5cbiAgICAgIHJldHVybiB0cy51cGRhdGVTb3VyY2VGaWxlTm9kZShzZiwgdHMuc2V0VGV4dFJhbmdlKHJlc3VsdCwgc2Yuc3RhdGVtZW50cykpO1xuICAgIH07XG5cbiAgICByZXR1cm4gdHJhbnNmb3JtZXI7XG4gIH07XG59XG5cbmZ1bmN0aW9uIHZpc2l0QmxvY2tTdGF0ZW1lbnRzKFxuICBzdGF0ZW1lbnRzOiB0cy5Ob2RlQXJyYXk8dHMuU3RhdGVtZW50PixcbiAgY29udGV4dDogdHMuVHJhbnNmb3JtYXRpb25Db250ZXh0LFxuKTogdHMuTm9kZUFycmF5PHRzLlN0YXRlbWVudD4ge1xuXG4gIC8vIGNvcHkgb2Ygc3RhdGVtZW50cyB0byBtb2RpZnk7IGxhenkgaW5pdGlhbGl6ZWRcbiAgbGV0IHVwZGF0ZWRTdGF0ZW1lbnRzOiBBcnJheTx0cy5TdGF0ZW1lbnQ+IHwgdW5kZWZpbmVkO1xuXG4gIGNvbnN0IHZpc2l0b3I6IHRzLlZpc2l0b3IgPSAobm9kZSkgPT4ge1xuICAgIGlmIChpc0Jsb2NrTGlrZShub2RlKSkge1xuICAgICAgbGV0IHJlc3VsdCA9IHZpc2l0QmxvY2tTdGF0ZW1lbnRzKG5vZGUuc3RhdGVtZW50cywgY29udGV4dCk7XG4gICAgICBpZiAocmVzdWx0ID09PSBub2RlLnN0YXRlbWVudHMpIHtcbiAgICAgICAgcmV0dXJuIG5vZGU7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSB0cy5zZXRUZXh0UmFuZ2UocmVzdWx0LCBub2RlLnN0YXRlbWVudHMpO1xuICAgICAgc3dpdGNoIChub2RlLmtpbmQpIHtcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkJsb2NrOlxuICAgICAgICAgIHJldHVybiB0cy51cGRhdGVCbG9jayhub2RlLCByZXN1bHQpO1xuICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuTW9kdWxlQmxvY2s6XG4gICAgICAgICAgcmV0dXJuIHRzLnVwZGF0ZU1vZHVsZUJsb2NrKG5vZGUsIHJlc3VsdCk7XG4gICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5DYXNlQ2xhdXNlOlxuICAgICAgICAgIHJldHVybiB0cy51cGRhdGVDYXNlQ2xhdXNlKG5vZGUsIG5vZGUuZXhwcmVzc2lvbiwgcmVzdWx0KTtcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkRlZmF1bHRDbGF1c2U6XG4gICAgICAgICAgcmV0dXJuIHRzLnVwZGF0ZURlZmF1bHRDbGF1c2Uobm9kZSwgcmVzdWx0KTtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICByZXR1cm4gbm9kZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHRzLnZpc2l0RWFjaENoaWxkKG5vZGUsIHZpc2l0b3IsIGNvbnRleHQpO1xuICAgIH1cbiAgfTtcblxuICAvLyAnb0luZGV4JyBpcyB0aGUgb3JpZ2luYWwgc3RhdGVtZW50IGluZGV4OyAndUluZGV4JyBpcyB0aGUgdXBkYXRlZCBzdGF0ZW1lbnQgaW5kZXhcbiAgZm9yIChsZXQgb0luZGV4ID0gMCwgdUluZGV4ID0gMDsgb0luZGV4IDwgc3RhdGVtZW50cy5sZW5ndGg7IG9JbmRleCsrLCB1SW5kZXgrKykge1xuICAgIGNvbnN0IGN1cnJlbnRTdGF0ZW1lbnQgPSBzdGF0ZW1lbnRzW29JbmRleF07XG5cbiAgICAvLyB0aGVzZSBjYW4ndCBjb250YWluIGFuIGVudW0gZGVjbGFyYXRpb25cbiAgICBpZiAoY3VycmVudFN0YXRlbWVudC5raW5kID09PSB0cy5TeW50YXhLaW5kLkltcG9ydERlY2xhcmF0aW9uKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBlbnVtIGRlY2xhcmF0aW9ucyBtdXN0OlxuICAgIC8vICAgKiBub3QgYmUgbGFzdCBzdGF0ZW1lbnRcbiAgICAvLyAgICogYmUgYSB2YXJpYWJsZSBzdGF0ZW1lbnRcbiAgICAvLyAgICogaGF2ZSBvbmx5IG9uZSBkZWNsYXJhdGlvblxuICAgIC8vICAgKiBoYXZlIGFuIGlkZW50aWZlciBhcyBhIGRlY2xhcmF0aW9uIG5hbWVcbiAgICBpZiAob0luZGV4IDwgc3RhdGVtZW50cy5sZW5ndGggLSAxXG4gICAgICAgICYmIHRzLmlzVmFyaWFibGVTdGF0ZW1lbnQoY3VycmVudFN0YXRlbWVudClcbiAgICAgICAgJiYgY3VycmVudFN0YXRlbWVudC5kZWNsYXJhdGlvbkxpc3QuZGVjbGFyYXRpb25zLmxlbmd0aCA9PT0gMSkge1xuXG4gICAgICBjb25zdCB2YXJpYWJsZURlY2xhcmF0aW9uID0gY3VycmVudFN0YXRlbWVudC5kZWNsYXJhdGlvbkxpc3QuZGVjbGFyYXRpb25zWzBdO1xuICAgICAgaWYgKHRzLmlzSWRlbnRpZmllcih2YXJpYWJsZURlY2xhcmF0aW9uLm5hbWUpKSB7XG4gICAgICAgIGNvbnN0IG5hbWUgPSB2YXJpYWJsZURlY2xhcmF0aW9uLm5hbWUudGV4dDtcblxuICAgICAgICBpZiAoIXZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIpIHtcbiAgICAgICAgICBjb25zdCBpaWZlID0gZmluZFRzMl8zRW51bUlpZmUobmFtZSwgc3RhdGVtZW50c1tvSW5kZXggKyAxXSk7XG4gICAgICAgICAgaWYgKGlpZmUpIHtcbiAgICAgICAgICAgIC8vIGZvdW5kIGFuIGVudW1cbiAgICAgICAgICAgIGlmICghdXBkYXRlZFN0YXRlbWVudHMpIHtcbiAgICAgICAgICAgICAgdXBkYXRlZFN0YXRlbWVudHMgPSBzdGF0ZW1lbnRzLnNsaWNlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyB1cGRhdGUgSUlGRSBhbmQgcmVwbGFjZSB2YXJpYWJsZSBzdGF0ZW1lbnQgYW5kIG9sZCBJSUZFXG4gICAgICAgICAgICB1cGRhdGVkU3RhdGVtZW50cy5zcGxpY2UodUluZGV4LCAyLCB1cGRhdGVFbnVtSWlmZShcbiAgICAgICAgICAgICAgY3VycmVudFN0YXRlbWVudCxcbiAgICAgICAgICAgICAgaWlmZVswXSxcbiAgICAgICAgICAgICAgaWlmZVsxXSxcbiAgICAgICAgICAgICkpO1xuICAgICAgICAgICAgLy8gc2tpcCBJSUZFIHN0YXRlbWVudFxuICAgICAgICAgICAgb0luZGV4Kys7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAodHMuaXNPYmplY3RMaXRlcmFsRXhwcmVzc2lvbih2YXJpYWJsZURlY2xhcmF0aW9uLmluaXRpYWxpemVyKVxuICAgICAgICAgICAgICAgICAgICYmIHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIucHJvcGVydGllcy5sZW5ndGggPT09IDApIHtcbiAgICAgICAgICBjb25zdCBlbnVtU3RhdGVtZW50cyA9IGZpbmRUczJfMkVudW1TdGF0ZW1lbnRzKG5hbWUsIHN0YXRlbWVudHMsIG9JbmRleCArIDEpO1xuICAgICAgICAgIGlmIChlbnVtU3RhdGVtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAvLyBmb3VuZCBhbiBlbnVtXG4gICAgICAgICAgICBpZiAoIXVwZGF0ZWRTdGF0ZW1lbnRzKSB7XG4gICAgICAgICAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzID0gc3RhdGVtZW50cy5zbGljZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gY3JlYXRlIHdyYXBwZXIgYW5kIHJlcGxhY2UgdmFyaWFibGUgc3RhdGVtZW50IGFuZCBlbnVtIG1lbWJlciBzdGF0ZW1lbnRzXG4gICAgICAgICAgICB1cGRhdGVkU3RhdGVtZW50cy5zcGxpY2UodUluZGV4LCBlbnVtU3RhdGVtZW50cy5sZW5ndGggKyAxLCBjcmVhdGVXcmFwcGVkRW51bShcbiAgICAgICAgICAgICAgbmFtZSxcbiAgICAgICAgICAgICAgY3VycmVudFN0YXRlbWVudCxcbiAgICAgICAgICAgICAgZW51bVN0YXRlbWVudHMsXG4gICAgICAgICAgICAgIHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXIsXG4gICAgICAgICAgICApKTtcbiAgICAgICAgICAgIC8vIHNraXAgZW51bSBtZW1iZXIgZGVjbGFyYXRpb25zXG4gICAgICAgICAgICBvSW5kZXggKz0gZW51bVN0YXRlbWVudHMubGVuZ3RoO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKHRzLmlzT2JqZWN0TGl0ZXJhbEV4cHJlc3Npb24odmFyaWFibGVEZWNsYXJhdGlvbi5pbml0aWFsaXplcilcbiAgICAgICAgICAmJiB2YXJpYWJsZURlY2xhcmF0aW9uLmluaXRpYWxpemVyLnByb3BlcnRpZXMubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgICAgY29uc3QgbGl0ZXJhbFByb3BlcnR5Q291bnQgPSB2YXJpYWJsZURlY2xhcmF0aW9uLmluaXRpYWxpemVyLnByb3BlcnRpZXMubGVuZ3RoO1xuXG4gICAgICAgICAgLy8gdHNpY2tsZSBlczIwMTUgZW51bXMgZmlyc3Qgc3RhdGVtZW50IGlzIGFuIGV4cG9ydCBkZWNsYXJhdGlvblxuICAgICAgICAgIGNvbnN0IGlzUG90ZW50aWFsRW51bUV4cG9ydCA9IHRzLmlzRXhwb3J0RGVjbGFyYXRpb24oc3RhdGVtZW50c1tvSW5kZXggKyAxXSk7XG4gICAgICAgICAgaWYgKGlzUG90ZW50aWFsRW51bUV4cG9ydCkge1xuICAgICAgICAgICAgLy8gc2tpcCB0aGUgZXhwb3J0XG4gICAgICAgICAgICBvSW5kZXggKys7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgZW51bVN0YXRlbWVudHMgPSBmaW5kRW51bU5hbWVTdGF0ZW1lbnRzKG5hbWUsIHN0YXRlbWVudHMsIG9JbmRleCArIDEpO1xuICAgICAgICAgIGlmIChlbnVtU3RhdGVtZW50cy5sZW5ndGggPT09IGxpdGVyYWxQcm9wZXJ0eUNvdW50KSB7XG4gICAgICAgICAgICAvLyBmb3VuZCBhbiBlbnVtXG4gICAgICAgICAgICBpZiAoIXVwZGF0ZWRTdGF0ZW1lbnRzKSB7XG4gICAgICAgICAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzID0gc3RhdGVtZW50cy5zbGljZSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gY3JlYXRlIHdyYXBwZXIgYW5kIHJlcGxhY2UgdmFyaWFibGUgc3RhdGVtZW50IGFuZCBlbnVtIG1lbWJlciBzdGF0ZW1lbnRzXG4gICAgICAgICAgICBjb25zdCBkZWxldGVDb3VudCA9IGVudW1TdGF0ZW1lbnRzLmxlbmd0aCArIChpc1BvdGVudGlhbEVudW1FeHBvcnQgPyAyIDogMSk7XG4gICAgICAgICAgICB1cGRhdGVkU3RhdGVtZW50cy5zcGxpY2UodUluZGV4LCBkZWxldGVDb3VudCwgY3JlYXRlV3JhcHBlZEVudW0oXG4gICAgICAgICAgICAgIG5hbWUsXG4gICAgICAgICAgICAgIGN1cnJlbnRTdGF0ZW1lbnQsXG4gICAgICAgICAgICAgIGVudW1TdGF0ZW1lbnRzLFxuICAgICAgICAgICAgICB2YXJpYWJsZURlY2xhcmF0aW9uLmluaXRpYWxpemVyLFxuICAgICAgICAgICAgICBpc1BvdGVudGlhbEVudW1FeHBvcnQsXG4gICAgICAgICAgICApKTtcbiAgICAgICAgICAgIC8vIHNraXAgZW51bSBtZW1iZXIgZGVjbGFyYXRpb25zXG4gICAgICAgICAgICBvSW5kZXggKz0gZW51bVN0YXRlbWVudHMubGVuZ3RoO1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcmVzdWx0ID0gdHMudmlzaXROb2RlKGN1cnJlbnRTdGF0ZW1lbnQsIHZpc2l0b3IpO1xuICAgIGlmIChyZXN1bHQgIT09IGN1cnJlbnRTdGF0ZW1lbnQpIHtcbiAgICAgIGlmICghdXBkYXRlZFN0YXRlbWVudHMpIHtcbiAgICAgICAgdXBkYXRlZFN0YXRlbWVudHMgPSBzdGF0ZW1lbnRzLnNsaWNlKCk7XG4gICAgICB9XG4gICAgICB1cGRhdGVkU3RhdGVtZW50c1t1SW5kZXhdID0gcmVzdWx0O1xuICAgIH1cbiAgfVxuXG4gIC8vIGlmIGNoYW5nZXMsIHJldHVybiB1cGRhdGVkIHN0YXRlbWVudHNcbiAgLy8gb3RoZXJ3aXNlLCByZXR1cm4gb3JpZ2luYWwgYXJyYXkgaW5zdGFuY2VcbiAgcmV0dXJuIHVwZGF0ZWRTdGF0ZW1lbnRzID8gdHMuY3JlYXRlTm9kZUFycmF5KHVwZGF0ZWRTdGF0ZW1lbnRzKSA6IHN0YXRlbWVudHM7XG59XG5cbi8vIFRTIDIuMyBlbnVtcyBoYXZlIHN0YXRlbWVudHMgdGhhdCBhcmUgaW5zaWRlIGEgSUlGRS5cbmZ1bmN0aW9uIGZpbmRUczJfM0VudW1JaWZlKFxuICBuYW1lOiBzdHJpbmcsXG4gIHN0YXRlbWVudDogdHMuU3RhdGVtZW50LFxuKTogW3RzLkNhbGxFeHByZXNzaW9uLCB0cy5FeHByZXNzaW9uIHwgdW5kZWZpbmVkXSB8IG51bGwge1xuICBpZiAoIXRzLmlzRXhwcmVzc2lvblN0YXRlbWVudChzdGF0ZW1lbnQpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBsZXQgZXhwcmVzc2lvbiA9IHN0YXRlbWVudC5leHByZXNzaW9uO1xuICB3aGlsZSAodHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbihleHByZXNzaW9uKSkge1xuICAgIGV4cHJlc3Npb24gPSBleHByZXNzaW9uLmV4cHJlc3Npb247XG4gIH1cblxuICBpZiAoIWV4cHJlc3Npb24gfHwgIXRzLmlzQ2FsbEV4cHJlc3Npb24oZXhwcmVzc2lvbikgfHwgZXhwcmVzc2lvbi5hcmd1bWVudHMubGVuZ3RoICE9PSAxKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCBjYWxsRXhwcmVzc2lvbiA9IGV4cHJlc3Npb247XG4gIGxldCBleHBvcnRFeHByZXNzaW9uO1xuXG4gIGxldCBhcmd1bWVudCA9IGV4cHJlc3Npb24uYXJndW1lbnRzWzBdO1xuICBpZiAoIXRzLmlzQmluYXJ5RXhwcmVzc2lvbihhcmd1bWVudCkpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGlmICghdHMuaXNJZGVudGlmaWVyKGFyZ3VtZW50LmxlZnQpIHx8IGFyZ3VtZW50LmxlZnQudGV4dCAhPT0gbmFtZSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgbGV0IHBvdGVudGlhbEV4cG9ydCA9IGZhbHNlO1xuICBpZiAoYXJndW1lbnQub3BlcmF0b3JUb2tlbi5raW5kID09PSB0cy5TeW50YXhLaW5kLkZpcnN0QXNzaWdubWVudCkge1xuICAgIGlmICghdHMuaXNCaW5hcnlFeHByZXNzaW9uKGFyZ3VtZW50LnJpZ2h0KVxuICAgICAgICB8fCBhcmd1bWVudC5yaWdodC5vcGVyYXRvclRva2VuLmtpbmQgIT09IHRzLlN5bnRheEtpbmQuQmFyQmFyVG9rZW4pIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIHBvdGVudGlhbEV4cG9ydCA9IHRydWU7XG4gICAgYXJndW1lbnQgPSBhcmd1bWVudC5yaWdodDtcbiAgfVxuXG4gIGlmICghdHMuaXNCaW5hcnlFeHByZXNzaW9uKGFyZ3VtZW50KSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgaWYgKGFyZ3VtZW50Lm9wZXJhdG9yVG9rZW4ua2luZCAhPT0gdHMuU3ludGF4S2luZC5CYXJCYXJUb2tlbikge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgaWYgKHBvdGVudGlhbEV4cG9ydCAmJiAhdHMuaXNJZGVudGlmaWVyKGFyZ3VtZW50LmxlZnQpKSB7XG4gICAgZXhwb3J0RXhwcmVzc2lvbiA9IGFyZ3VtZW50LmxlZnQ7XG4gIH1cblxuICBleHByZXNzaW9uID0gZXhwcmVzc2lvbi5leHByZXNzaW9uO1xuICB3aGlsZSAodHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbihleHByZXNzaW9uKSkge1xuICAgIGV4cHJlc3Npb24gPSBleHByZXNzaW9uLmV4cHJlc3Npb247XG4gIH1cblxuICBpZiAoIWV4cHJlc3Npb24gfHwgIXRzLmlzRnVuY3Rpb25FeHByZXNzaW9uKGV4cHJlc3Npb24pIHx8IGV4cHJlc3Npb24ucGFyYW1ldGVycy5sZW5ndGggIT09IDEpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGNvbnN0IHBhcmFtZXRlciA9IGV4cHJlc3Npb24ucGFyYW1ldGVyc1swXTtcbiAgaWYgKCF0cy5pc0lkZW50aWZpZXIocGFyYW1ldGVyLm5hbWUpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICAvLyBUaGUgbmFtZSBvZiB0aGUgcGFyYW1ldGVyIGNhbiBiZSBkaWZmZXJlbnQgdGhhbiB0aGUgbmFtZSBvZiB0aGUgZW51bSBpZiBpdCB3YXMgcmVuYW1lZFxuICAvLyBkdWUgdG8gc2NvcGUgaG9pc3RpbmcuXG4gIGNvbnN0IHBhcmFtZXRlck5hbWUgPSBwYXJhbWV0ZXIubmFtZS50ZXh0O1xuXG4gIC8vIEluIFRTIDIuMyBlbnVtcywgdGhlIElJRkUgY29udGFpbnMgb25seSBleHByZXNzaW9ucyB3aXRoIGEgY2VydGFpbiBmb3JtYXQuXG4gIC8vIElmIHdlIGZpbmQgYW55IHRoYXQgaXMgZGlmZmVyZW50LCB3ZSBpZ25vcmUgdGhlIHdob2xlIHRoaW5nLlxuICBmb3IgKGxldCBib2R5SW5kZXggPSAwOyBib2R5SW5kZXggPCBleHByZXNzaW9uLmJvZHkuc3RhdGVtZW50cy5sZW5ndGg7ICsrYm9keUluZGV4KSB7XG4gICAgY29uc3QgYm9keVN0YXRlbWVudCA9IGV4cHJlc3Npb24uYm9keS5zdGF0ZW1lbnRzW2JvZHlJbmRleF07XG5cbiAgICBpZiAoIXRzLmlzRXhwcmVzc2lvblN0YXRlbWVudChib2R5U3RhdGVtZW50KSB8fCAhYm9keVN0YXRlbWVudC5leHByZXNzaW9uKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoIXRzLmlzQmluYXJ5RXhwcmVzc2lvbihib2R5U3RhdGVtZW50LmV4cHJlc3Npb24pXG4gICAgICAgIHx8IGJvZHlTdGF0ZW1lbnQuZXhwcmVzc2lvbi5vcGVyYXRvclRva2VuLmtpbmQgIT09IHRzLlN5bnRheEtpbmQuRmlyc3RBc3NpZ25tZW50KSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBhc3NpZ25tZW50ID0gYm9keVN0YXRlbWVudC5leHByZXNzaW9uLmxlZnQ7XG4gICAgY29uc3QgdmFsdWUgPSBib2R5U3RhdGVtZW50LmV4cHJlc3Npb24ucmlnaHQ7XG4gICAgaWYgKCF0cy5pc0VsZW1lbnRBY2Nlc3NFeHByZXNzaW9uKGFzc2lnbm1lbnQpIHx8ICF0cy5pc1N0cmluZ0xpdGVyYWwodmFsdWUpKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoIXRzLmlzSWRlbnRpZmllcihhc3NpZ25tZW50LmV4cHJlc3Npb24pIHx8IGFzc2lnbm1lbnQuZXhwcmVzc2lvbi50ZXh0ICE9PSBwYXJhbWV0ZXJOYW1lKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBtZW1iZXJBcmd1bWVudCA9IGFzc2lnbm1lbnQuYXJndW1lbnRFeHByZXNzaW9uO1xuICAgIGlmICghbWVtYmVyQXJndW1lbnQgfHwgIXRzLmlzQmluYXJ5RXhwcmVzc2lvbihtZW1iZXJBcmd1bWVudClcbiAgICAgICAgfHwgbWVtYmVyQXJndW1lbnQub3BlcmF0b3JUb2tlbi5raW5kICE9PSB0cy5TeW50YXhLaW5kLkZpcnN0QXNzaWdubWVudCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG5cbiAgICBpZiAoIXRzLmlzRWxlbWVudEFjY2Vzc0V4cHJlc3Npb24obWVtYmVyQXJndW1lbnQubGVmdCkpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGlmICghdHMuaXNJZGVudGlmaWVyKG1lbWJlckFyZ3VtZW50LmxlZnQuZXhwcmVzc2lvbilcbiAgICAgIHx8IG1lbWJlckFyZ3VtZW50LmxlZnQuZXhwcmVzc2lvbi50ZXh0ICE9PSBwYXJhbWV0ZXJOYW1lKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAoIW1lbWJlckFyZ3VtZW50LmxlZnQuYXJndW1lbnRFeHByZXNzaW9uXG4gICAgICAgIHx8ICF0cy5pc1N0cmluZ0xpdGVyYWwobWVtYmVyQXJndW1lbnQubGVmdC5hcmd1bWVudEV4cHJlc3Npb24pKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBpZiAobWVtYmVyQXJndW1lbnQubGVmdC5hcmd1bWVudEV4cHJlc3Npb24udGV4dCAhPT0gdmFsdWUudGV4dCkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIFtjYWxsRXhwcmVzc2lvbiwgZXhwb3J0RXhwcmVzc2lvbl07XG59XG5cbi8vIFRTIDIuMiBlbnVtcyBoYXZlIHN0YXRlbWVudHMgYWZ0ZXIgdGhlIHZhcmlhYmxlIGRlY2xhcmF0aW9uLCB3aXRoIGluZGV4IHN0YXRlbWVudHMgZm9sbG93ZWRcbi8vIGJ5IHZhbHVlIHN0YXRlbWVudHMuXG5mdW5jdGlvbiBmaW5kVHMyXzJFbnVtU3RhdGVtZW50cyhcbiAgbmFtZTogc3RyaW5nLFxuICBzdGF0ZW1lbnRzOiB0cy5Ob2RlQXJyYXk8dHMuU3RhdGVtZW50PixcbiAgc3RhdGVtZW50T2Zmc2V0OiBudW1iZXIsXG4pOiB0cy5TdGF0ZW1lbnRbXSB7XG4gIGNvbnN0IGVudW1WYWx1ZVN0YXRlbWVudHM6IHRzLlN0YXRlbWVudFtdID0gW107XG4gIGNvbnN0IG1lbWJlck5hbWVzOiBzdHJpbmdbXSA9IFtdO1xuXG4gIGxldCBpbmRleCA9IHN0YXRlbWVudE9mZnNldDtcbiAgZm9yICg7IGluZGV4IDwgc3RhdGVtZW50cy5sZW5ndGg7ICsraW5kZXgpIHtcbiAgICAvLyBFbnN1cmUgYWxsIHN0YXRlbWVudHMgYXJlIG9mIHRoZSBleHBlY3RlZCBmb3JtYXQgYW5kIHVzaW5nIHRoZSByaWdodCBpZGVudGlmZXIuXG4gICAgLy8gV2hlbiB3ZSBmaW5kIGEgc3RhdGVtZW50IHRoYXQgaXNuJ3QgcGFydCBvZiB0aGUgZW51bSwgcmV0dXJuIHdoYXQgd2UgY29sbGVjdGVkIHNvIGZhci5cbiAgICBjb25zdCBjdXJyZW50ID0gc3RhdGVtZW50c1tpbmRleF07XG4gICAgaWYgKCF0cy5pc0V4cHJlc3Npb25TdGF0ZW1lbnQoY3VycmVudCkgfHwgIXRzLmlzQmluYXJ5RXhwcmVzc2lvbihjdXJyZW50LmV4cHJlc3Npb24pKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBjb25zdCBwcm9wZXJ0eSA9IGN1cnJlbnQuZXhwcmVzc2lvbi5sZWZ0O1xuICAgIGlmICghcHJvcGVydHkgfHwgIXRzLmlzUHJvcGVydHlBY2Nlc3NFeHByZXNzaW9uKHByb3BlcnR5KSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKCF0cy5pc0lkZW50aWZpZXIocHJvcGVydHkuZXhwcmVzc2lvbikgfHwgcHJvcGVydHkuZXhwcmVzc2lvbi50ZXh0ICE9PSBuYW1lKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBtZW1iZXJOYW1lcy5wdXNoKHByb3BlcnR5Lm5hbWUudGV4dCk7XG4gICAgZW51bVZhbHVlU3RhdGVtZW50cy5wdXNoKGN1cnJlbnQpO1xuICB9XG5cbiAgaWYgKGVudW1WYWx1ZVN0YXRlbWVudHMubGVuZ3RoID09PSAwKSB7XG4gICAgcmV0dXJuIFtdO1xuICB9XG5cbiAgY29uc3QgZW51bU5hbWVTdGF0ZW1lbnRzID0gZmluZEVudW1OYW1lU3RhdGVtZW50cyhuYW1lLCBzdGF0ZW1lbnRzLCBpbmRleCwgbWVtYmVyTmFtZXMpO1xuICBpZiAoZW51bU5hbWVTdGF0ZW1lbnRzLmxlbmd0aCAhPT0gZW51bVZhbHVlU3RhdGVtZW50cy5sZW5ndGgpIHtcbiAgICByZXR1cm4gW107XG4gIH1cblxuICByZXR1cm4gZW51bVZhbHVlU3RhdGVtZW50cy5jb25jYXQoZW51bU5hbWVTdGF0ZW1lbnRzKTtcbn1cblxuLy8gVHNpY2tsZSBlbnVtcyBoYXZlIGEgdmFyaWFibGUgc3RhdGVtZW50IHdpdGggaW5kZXhlcywgZm9sbG93ZWQgYnkgdmFsdWUgc3RhdGVtZW50cy5cbi8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vYW5ndWxhci9kZXZraXQvaXNzdWVzLzIyOSNpc3N1ZWNvbW1lbnQtMzM4NTEyMDU2IGZvcmUgbW9yZSBpbmZvcm1hdGlvbi5cbmZ1bmN0aW9uIGZpbmRFbnVtTmFtZVN0YXRlbWVudHMoXG4gIG5hbWU6IHN0cmluZyxcbiAgc3RhdGVtZW50czogdHMuTm9kZUFycmF5PHRzLlN0YXRlbWVudD4sXG4gIHN0YXRlbWVudE9mZnNldDogbnVtYmVyLFxuICBtZW1iZXJOYW1lcz86IHN0cmluZ1tdLFxuKTogdHMuU3RhdGVtZW50W10ge1xuICBjb25zdCBlbnVtU3RhdGVtZW50czogdHMuU3RhdGVtZW50W10gPSBbXTtcblxuICBmb3IgKGxldCBpbmRleCA9IHN0YXRlbWVudE9mZnNldDsgaW5kZXggPCBzdGF0ZW1lbnRzLmxlbmd0aDsgKytpbmRleCkge1xuICAgIC8vIEVuc3VyZSBhbGwgc3RhdGVtZW50cyBhcmUgb2YgdGhlIGV4cGVjdGVkIGZvcm1hdCBhbmQgdXNpbmcgdGhlIHJpZ2h0IGlkZW50aWZlci5cbiAgICAvLyBXaGVuIHdlIGZpbmQgYSBzdGF0ZW1lbnQgdGhhdCBpc24ndCBwYXJ0IG9mIHRoZSBlbnVtLCByZXR1cm4gd2hhdCB3ZSBjb2xsZWN0ZWQgc28gZmFyLlxuICAgIGNvbnN0IGN1cnJlbnQgPSBzdGF0ZW1lbnRzW2luZGV4XTtcbiAgICBpZiAoIXRzLmlzRXhwcmVzc2lvblN0YXRlbWVudChjdXJyZW50KSB8fCAhdHMuaXNCaW5hcnlFeHByZXNzaW9uKGN1cnJlbnQuZXhwcmVzc2lvbikpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGNvbnN0IGFjY2VzcyA9IGN1cnJlbnQuZXhwcmVzc2lvbi5sZWZ0O1xuICAgIGNvbnN0IHZhbHVlID0gY3VycmVudC5leHByZXNzaW9uLnJpZ2h0O1xuICAgIGlmICghYWNjZXNzIHx8ICF0cy5pc0VsZW1lbnRBY2Nlc3NFeHByZXNzaW9uKGFjY2VzcykgfHwgIXZhbHVlIHx8ICF0cy5pc1N0cmluZ0xpdGVyYWwodmFsdWUpKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBpZiAobWVtYmVyTmFtZXMgJiYgIW1lbWJlck5hbWVzLmluY2x1ZGVzKHZhbHVlLnRleHQpKSB7XG4gICAgICBicmVhaztcbiAgICB9XG5cbiAgICBpZiAoIXRzLmlzSWRlbnRpZmllcihhY2Nlc3MuZXhwcmVzc2lvbikgfHwgYWNjZXNzLmV4cHJlc3Npb24udGV4dCAhPT0gbmFtZSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgaWYgKCFhY2Nlc3MuYXJndW1lbnRFeHByZXNzaW9uIHx8ICF0cy5pc1Byb3BlcnR5QWNjZXNzRXhwcmVzc2lvbihhY2Nlc3MuYXJndW1lbnRFeHByZXNzaW9uKSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgY29uc3QgZW51bUV4cHJlc3Npb24gPSBhY2Nlc3MuYXJndW1lbnRFeHByZXNzaW9uLmV4cHJlc3Npb247XG4gICAgaWYgKCF0cy5pc0lkZW50aWZpZXIoZW51bUV4cHJlc3Npb24pIHx8IGVudW1FeHByZXNzaW9uLnRleHQgIT09IG5hbWUpIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIGlmICh2YWx1ZS50ZXh0ICE9PSBhY2Nlc3MuYXJndW1lbnRFeHByZXNzaW9uLm5hbWUudGV4dCkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgZW51bVN0YXRlbWVudHMucHVzaChjdXJyZW50KTtcbiAgfVxuXG4gIHJldHVybiBlbnVtU3RhdGVtZW50cztcbn1cblxuZnVuY3Rpb24gYWRkUHVyZUNvbW1lbnQ8VCBleHRlbmRzIHRzLk5vZGU+KG5vZGU6IFQpOiBUIHtcbiAgY29uc3QgcHVyZUZ1bmN0aW9uQ29tbWVudCA9ICdAX19QVVJFX18nO1xuXG4gIHJldHVybiB0cy5hZGRTeW50aGV0aWNMZWFkaW5nQ29tbWVudChcbiAgICBub2RlLFxuICAgIHRzLlN5bnRheEtpbmQuTXVsdGlMaW5lQ29tbWVudFRyaXZpYSxcbiAgICBwdXJlRnVuY3Rpb25Db21tZW50LFxuICAgIGZhbHNlLFxuICApO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVIb3N0Tm9kZShcbiAgaG9zdE5vZGU6IHRzLlZhcmlhYmxlU3RhdGVtZW50LFxuICBleHByZXNzaW9uOiB0cy5FeHByZXNzaW9uLFxuKTogdHMuU3RhdGVtZW50IHtcblxuICAvLyBVcGRhdGUgZXhpc3RpbmcgaG9zdCBub2RlIHdpdGggdGhlIHB1cmUgY29tbWVudCBiZWZvcmUgdGhlIHZhcmlhYmxlIGRlY2xhcmF0aW9uIGluaXRpYWxpemVyLlxuICBjb25zdCB2YXJpYWJsZURlY2xhcmF0aW9uID0gaG9zdE5vZGUuZGVjbGFyYXRpb25MaXN0LmRlY2xhcmF0aW9uc1swXTtcbiAgY29uc3Qgb3V0ZXJWYXJTdG10ID0gdHMudXBkYXRlVmFyaWFibGVTdGF0ZW1lbnQoXG4gICAgaG9zdE5vZGUsXG4gICAgaG9zdE5vZGUubW9kaWZpZXJzLFxuICAgIHRzLnVwZGF0ZVZhcmlhYmxlRGVjbGFyYXRpb25MaXN0KFxuICAgICAgaG9zdE5vZGUuZGVjbGFyYXRpb25MaXN0LFxuICAgICAgW1xuICAgICAgICB0cy51cGRhdGVWYXJpYWJsZURlY2xhcmF0aW9uKFxuICAgICAgICAgIHZhcmlhYmxlRGVjbGFyYXRpb24sXG4gICAgICAgICAgdmFyaWFibGVEZWNsYXJhdGlvbi5uYW1lLFxuICAgICAgICAgIHZhcmlhYmxlRGVjbGFyYXRpb24udHlwZSxcbiAgICAgICAgICBleHByZXNzaW9uLFxuICAgICAgICApLFxuICAgICAgXSxcbiAgICApLFxuICApO1xuXG4gIHJldHVybiBvdXRlclZhclN0bXQ7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZUVudW1JaWZlKFxuICBob3N0Tm9kZTogdHMuVmFyaWFibGVTdGF0ZW1lbnQsXG4gIGlpZmU6IHRzLkNhbGxFeHByZXNzaW9uLFxuICBleHBvcnRBc3NpZ25tZW50PzogdHMuRXhwcmVzc2lvbixcbik6IHRzLlN0YXRlbWVudCB7XG4gIGlmICghdHMuaXNQYXJlbnRoZXNpemVkRXhwcmVzc2lvbihpaWZlLmV4cHJlc3Npb24pXG4gICAgICB8fCAhdHMuaXNGdW5jdGlvbkV4cHJlc3Npb24oaWlmZS5leHByZXNzaW9uLmV4cHJlc3Npb24pKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIElJRkUgU3RydWN0dXJlJyk7XG4gIH1cblxuICAvLyBJZ25vcmUgZXhwb3J0IGFzc2lnbm1lbnQgaWYgdmFyaWFibGUgaXMgZGlyZWN0bHkgZXhwb3J0ZWRcbiAgaWYgKGhvc3ROb2RlLm1vZGlmaWVyc1xuICAgICAgJiYgaG9zdE5vZGUubW9kaWZpZXJzLmZpbmRJbmRleChtID0+IG0ua2luZCA9PSB0cy5TeW50YXhLaW5kLkV4cG9ydEtleXdvcmQpICE9IC0xKSB7XG4gICAgZXhwb3J0QXNzaWdubWVudCA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIGNvbnN0IGV4cHJlc3Npb24gPSBpaWZlLmV4cHJlc3Npb24uZXhwcmVzc2lvbjtcbiAgY29uc3QgdXBkYXRlZEZ1bmN0aW9uID0gdHMudXBkYXRlRnVuY3Rpb25FeHByZXNzaW9uKFxuICAgIGV4cHJlc3Npb24sXG4gICAgZXhwcmVzc2lvbi5tb2RpZmllcnMsXG4gICAgZXhwcmVzc2lvbi5hc3Rlcmlza1Rva2VuLFxuICAgIGV4cHJlc3Npb24ubmFtZSxcbiAgICBleHByZXNzaW9uLnR5cGVQYXJhbWV0ZXJzLFxuICAgIGV4cHJlc3Npb24ucGFyYW1ldGVycyxcbiAgICBleHByZXNzaW9uLnR5cGUsXG4gICAgdHMudXBkYXRlQmxvY2soXG4gICAgICBleHByZXNzaW9uLmJvZHksXG4gICAgICBbXG4gICAgICAgIC4uLmV4cHJlc3Npb24uYm9keS5zdGF0ZW1lbnRzLFxuICAgICAgICB0cy5jcmVhdGVSZXR1cm4oZXhwcmVzc2lvbi5wYXJhbWV0ZXJzWzBdLm5hbWUgYXMgdHMuSWRlbnRpZmllciksXG4gICAgICBdLFxuICAgICksXG4gICk7XG5cbiAgbGV0IGFyZzogdHMuRXhwcmVzc2lvbiA9IHRzLmNyZWF0ZU9iamVjdExpdGVyYWwoKTtcbiAgaWYgKGV4cG9ydEFzc2lnbm1lbnQpIHtcbiAgICBhcmcgPSB0cy5jcmVhdGVCaW5hcnkoZXhwb3J0QXNzaWdubWVudCwgdHMuU3ludGF4S2luZC5CYXJCYXJUb2tlbiwgYXJnKTtcbiAgfVxuICBjb25zdCB1cGRhdGVkSWlmZSA9IHRzLnVwZGF0ZUNhbGwoXG4gICAgaWlmZSxcbiAgICB0cy51cGRhdGVQYXJlbihcbiAgICAgIGlpZmUuZXhwcmVzc2lvbixcbiAgICAgIHVwZGF0ZWRGdW5jdGlvbixcbiAgICApLFxuICAgIGlpZmUudHlwZUFyZ3VtZW50cyxcbiAgICBbYXJnXSxcbiAgKTtcblxuICBsZXQgdmFsdWU6IHRzLkV4cHJlc3Npb24gPSBhZGRQdXJlQ29tbWVudCh1cGRhdGVkSWlmZSk7XG4gIGlmIChleHBvcnRBc3NpZ25tZW50KSB7XG4gICAgdmFsdWUgPSB0cy5jcmVhdGVCaW5hcnkoXG4gICAgICBleHBvcnRBc3NpZ25tZW50LFxuICAgICAgdHMuU3ludGF4S2luZC5GaXJzdEFzc2lnbm1lbnQsXG4gICAgICB1cGRhdGVkSWlmZSk7XG4gIH1cblxuICByZXR1cm4gdXBkYXRlSG9zdE5vZGUoaG9zdE5vZGUsIHZhbHVlKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlV3JhcHBlZEVudW0oXG4gIG5hbWU6IHN0cmluZyxcbiAgaG9zdE5vZGU6IHRzLlZhcmlhYmxlU3RhdGVtZW50LFxuICBzdGF0ZW1lbnRzOiBBcnJheTx0cy5TdGF0ZW1lbnQ+LFxuICBsaXRlcmFsSW5pdGlhbGl6ZXI6IHRzLk9iamVjdExpdGVyYWxFeHByZXNzaW9uIHwgdW5kZWZpbmVkLFxuICBhZGRFeHBvcnRNb2RpZmllciA9IGZhbHNlLFxuKTogdHMuU3RhdGVtZW50IHtcbiAgbGl0ZXJhbEluaXRpYWxpemVyID0gbGl0ZXJhbEluaXRpYWxpemVyIHx8IHRzLmNyZWF0ZU9iamVjdExpdGVyYWwoKTtcblxuICBjb25zdCBub2RlID0gYWRkRXhwb3J0TW9kaWZpZXJcbiAgICA/IHRzLnVwZGF0ZVZhcmlhYmxlU3RhdGVtZW50KFxuICAgICAgaG9zdE5vZGUsXG4gICAgICBbdHMuY3JlYXRlVG9rZW4odHMuU3ludGF4S2luZC5FeHBvcnRLZXl3b3JkKV0sXG4gICAgICBob3N0Tm9kZS5kZWNsYXJhdGlvbkxpc3QsXG4gICAgKVxuICAgIDogaG9zdE5vZGU7XG5cbiAgY29uc3QgaW5uZXJWYXJTdG10ID0gdHMuY3JlYXRlVmFyaWFibGVTdGF0ZW1lbnQoXG4gICAgdW5kZWZpbmVkLFxuICAgIHRzLmNyZWF0ZVZhcmlhYmxlRGVjbGFyYXRpb25MaXN0KFtcbiAgICAgIHRzLmNyZWF0ZVZhcmlhYmxlRGVjbGFyYXRpb24obmFtZSwgdW5kZWZpbmVkLCBsaXRlcmFsSW5pdGlhbGl6ZXIpLFxuICAgIF0pLFxuICApO1xuXG4gIGNvbnN0IGlubmVyUmV0dXJuID0gdHMuY3JlYXRlUmV0dXJuKHRzLmNyZWF0ZUlkZW50aWZpZXIobmFtZSkpO1xuXG4gIGNvbnN0IGlpZmUgPSB0cy5jcmVhdGVJbW1lZGlhdGVseUludm9rZWRGdW5jdGlvbkV4cHJlc3Npb24oW1xuICAgIGlubmVyVmFyU3RtdCxcbiAgICAuLi5zdGF0ZW1lbnRzLFxuICAgIGlubmVyUmV0dXJuLFxuICBdKTtcblxuICByZXR1cm4gdXBkYXRlSG9zdE5vZGUobm9kZSwgYWRkUHVyZUNvbW1lbnQodHMuY3JlYXRlUGFyZW4oaWlmZSkpKTtcbn1cbiJdfQ==