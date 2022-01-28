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
exports.getWrapEnumsTransformer = void 0;
const ts = __importStar(require("typescript"));
const ast_utils_1 = require("../helpers/ast-utils");
function isBlockLike(node) {
    return (node.kind === ts.SyntaxKind.Block ||
        node.kind === ts.SyntaxKind.ModuleBlock ||
        node.kind === ts.SyntaxKind.CaseClause ||
        node.kind === ts.SyntaxKind.DefaultClause ||
        node.kind === ts.SyntaxKind.SourceFile);
}
function getWrapEnumsTransformer() {
    return (context) => {
        const transformer = (sf) => {
            const result = visitBlockStatements(sf.statements, context);
            return context.factory.updateSourceFile(sf, ts.setTextRange(result, sf.statements));
        };
        return transformer;
    };
}
exports.getWrapEnumsTransformer = getWrapEnumsTransformer;
function visitBlockStatements(statements, context) {
    // copy of statements to modify; lazy initialized
    let updatedStatements;
    const nodeFactory = context.factory;
    const visitor = (node) => {
        if (isBlockLike(node)) {
            let result = visitBlockStatements(node.statements, context);
            if (result === node.statements) {
                return node;
            }
            result = ts.setTextRange(result, node.statements);
            switch (node.kind) {
                case ts.SyntaxKind.Block:
                    return nodeFactory.updateBlock(node, result);
                case ts.SyntaxKind.ModuleBlock:
                    return nodeFactory.updateModuleBlock(node, result);
                case ts.SyntaxKind.CaseClause:
                    return nodeFactory.updateCaseClause(node, node.expression, result);
                case ts.SyntaxKind.DefaultClause:
                    return nodeFactory.updateDefaultClause(node, result);
                default:
                    return node;
            }
        }
        else {
            return node;
        }
    };
    // 'oIndex' is the original statement index; 'uIndex' is the updated statement index
    for (let oIndex = 0, uIndex = 0; oIndex < statements.length - 1; oIndex++, uIndex++) {
        const currentStatement = statements[oIndex];
        let newStatement;
        let oldStatementsLength = 0;
        // these can't contain an enum declaration
        if (currentStatement.kind === ts.SyntaxKind.ImportDeclaration) {
            continue;
        }
        // enum declarations must:
        //   * not be last statement
        //   * be a variable statement
        //   * have only one declaration
        //   * have an identifer as a declaration name
        // ClassExpression declarations must:
        //   * not be last statement
        //   * be a variable statement
        //   * have only one declaration
        //   * have an ClassExpression or BinaryExpression and a right
        //     of kind ClassExpression as a initializer
        if (ts.isVariableStatement(currentStatement) &&
            currentStatement.declarationList.declarations.length === 1) {
            const variableDeclaration = currentStatement.declarationList.declarations[0];
            const initializer = variableDeclaration.initializer;
            if (ts.isIdentifier(variableDeclaration.name)) {
                const name = variableDeclaration.name.text;
                if (!initializer) {
                    const iife = findEnumIife(name, statements[oIndex + 1]);
                    if (iife) {
                        // update IIFE and replace variable statement and old IIFE
                        oldStatementsLength = 2;
                        newStatement = updateEnumIife(nodeFactory, currentStatement, iife[0], iife[1]);
                        // skip IIFE statement
                        oIndex++;
                    }
                }
                else if (ts.isClassExpression(initializer) ||
                    (ts.isBinaryExpression(initializer) && ts.isClassExpression(initializer.right))) {
                    const classStatements = findStatements(name, statements, oIndex);
                    if (!classStatements) {
                        continue;
                    }
                    oldStatementsLength = classStatements.length;
                    newStatement = createWrappedClass(nodeFactory, variableDeclaration, classStatements);
                    oIndex += classStatements.length - 1;
                }
            }
        }
        else if (ts.isClassDeclaration(currentStatement)) {
            const name = currentStatement.name.text;
            const classStatements = findStatements(name, statements, oIndex);
            if (!classStatements) {
                continue;
            }
            oldStatementsLength = classStatements.length;
            newStatement = createWrappedClass(nodeFactory, currentStatement, classStatements);
            oIndex += oldStatementsLength - 1;
        }
        if (newStatement && newStatement.length > 0) {
            if (!updatedStatements) {
                updatedStatements = [...statements];
            }
            updatedStatements.splice(uIndex, oldStatementsLength, ...newStatement);
            // When having more than a single new statement
            // we need to update the update Index
            uIndex += newStatement ? newStatement.length - 1 : 0;
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
    return updatedStatements ? nodeFactory.createNodeArray(updatedStatements) : statements;
}
// TS 2.3 enums have statements that are inside a IIFE.
function findEnumIife(name, statement) {
    if (!ts.isExpressionStatement(statement)) {
        return null;
    }
    const expression = statement.expression;
    if (!expression || !ts.isCallExpression(expression) || expression.arguments.length !== 1) {
        return null;
    }
    const callExpression = expression;
    let exportExpression;
    if (!ts.isParenthesizedExpression(callExpression.expression)) {
        return null;
    }
    const functionExpression = callExpression.expression.expression;
    if (!ts.isFunctionExpression(functionExpression)) {
        return null;
    }
    // The name of the parameter can be different than the name of the enum if it was renamed
    // due to scope hoisting.
    const parameter = functionExpression.parameters[0];
    if (!ts.isIdentifier(parameter.name)) {
        return null;
    }
    const parameterName = parameter.name.text;
    let argument = callExpression.arguments[0];
    if (!ts.isBinaryExpression(argument) ||
        !ts.isIdentifier(argument.left) ||
        argument.left.text !== name) {
        return null;
    }
    let potentialExport = false;
    if (argument.operatorToken.kind === ts.SyntaxKind.FirstAssignment) {
        if (ts.isBinaryExpression(argument.right) &&
            argument.right.operatorToken.kind !== ts.SyntaxKind.BarBarToken) {
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
    // Go through all the statements and check that all match the name
    for (const statement of functionExpression.body.statements) {
        if (!ts.isExpressionStatement(statement) ||
            !ts.isBinaryExpression(statement.expression) ||
            !ts.isElementAccessExpression(statement.expression.left)) {
            return null;
        }
        const leftExpression = statement.expression.left.expression;
        if (!ts.isIdentifier(leftExpression) || leftExpression.text !== parameterName) {
            return null;
        }
    }
    return [callExpression, exportExpression];
}
function updateHostNode(nodeFactory, hostNode, expression) {
    // Update existing host node with the pure comment before the variable declaration initializer.
    const variableDeclaration = hostNode.declarationList.declarations[0];
    const outerVarStmt = nodeFactory.updateVariableStatement(hostNode, hostNode.modifiers, nodeFactory.updateVariableDeclarationList(hostNode.declarationList, [
        nodeFactory.updateVariableDeclaration(variableDeclaration, variableDeclaration.name, variableDeclaration.exclamationToken, variableDeclaration.type, expression),
    ]));
    return outerVarStmt;
}
/**
 * Find enums, class expression or declaration statements.
 *
 * The classExpressions block to wrap in an iife must
 * - end with an ExpressionStatement
 * - it's expression must be a BinaryExpression
 * - have the same name
 *
 * ```
 let Foo = class Foo {};
 Foo = __decorate([]);
 ```
 */
function findStatements(name, statements, statementIndex, offset = 0) {
    let count = 1;
    for (let index = statementIndex + 1; index < statements.length; ++index) {
        const statement = statements[index];
        if (!ts.isExpressionStatement(statement)) {
            break;
        }
        const expression = statement.expression;
        if (ts.isCallExpression(expression)) {
            // Ex:
            // setClassMetadata(FooClass, [{}], void 0);
            // __decorate([propDecorator()], FooClass.prototype, "propertyName", void 0);
            // __decorate([propDecorator()], FooClass, "propertyName", void 0);
            // __decorate$1([propDecorator()], FooClass, "propertyName", void 0);
            const args = expression.arguments;
            if (args.length > 2) {
                const isReferenced = args.some((arg) => {
                    const potentialIdentifier = ts.isPropertyAccessExpression(arg) ? arg.expression : arg;
                    return ts.isIdentifier(potentialIdentifier) && potentialIdentifier.text === name;
                });
                if (isReferenced) {
                    count++;
                    continue;
                }
            }
        }
        else if (ts.isBinaryExpression(expression)) {
            const node = ts.isBinaryExpression(expression.left) ? expression.left.left : expression.left;
            const leftExpression = ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
                ? // Static Properties // Ex: Foo.bar = 'value';
                    // ENUM Property // Ex:  ChangeDetectionStrategy[ChangeDetectionStrategy.Default] = "Default";
                    node.expression
                : // Ex: FooClass = __decorate([Component()], FooClass);
                    node;
            if (ts.isIdentifier(leftExpression) && leftExpression.text === name) {
                count++;
                continue;
            }
        }
        break;
    }
    if (count > 1) {
        return statements.slice(statementIndex + offset, statementIndex + count);
    }
    return undefined;
}
function updateEnumIife(nodeFactory, hostNode, iife, exportAssignment) {
    if (!ts.isParenthesizedExpression(iife.expression) ||
        !ts.isFunctionExpression(iife.expression.expression)) {
        throw new Error('Invalid IIFE Structure');
    }
    // Ignore export assignment if variable is directly exported
    if (hostNode.modifiers &&
        hostNode.modifiers.findIndex((m) => m.kind == ts.SyntaxKind.ExportKeyword) != -1) {
        exportAssignment = undefined;
    }
    const expression = iife.expression.expression;
    const updatedFunction = nodeFactory.updateFunctionExpression(expression, expression.modifiers, expression.asteriskToken, expression.name, expression.typeParameters, expression.parameters, expression.type, nodeFactory.updateBlock(expression.body, [
        ...expression.body.statements,
        nodeFactory.createReturnStatement(expression.parameters[0].name),
    ]));
    let arg = nodeFactory.createObjectLiteralExpression();
    if (exportAssignment) {
        arg = nodeFactory.createBinaryExpression(exportAssignment, ts.SyntaxKind.BarBarToken, arg);
    }
    const updatedIife = nodeFactory.updateCallExpression(iife, nodeFactory.updateParenthesizedExpression(iife.expression, updatedFunction), iife.typeArguments, [arg]);
    let value = (0, ast_utils_1.addPureComment)(updatedIife);
    if (exportAssignment) {
        value = nodeFactory.createBinaryExpression(exportAssignment, ts.SyntaxKind.FirstAssignment, updatedIife);
    }
    return [updateHostNode(nodeFactory, hostNode, value)];
}
function createWrappedClass(nodeFactory, hostNode, statements) {
    const name = hostNode.name.text;
    const updatedStatements = [...statements];
    if (ts.isClassDeclaration(hostNode)) {
        updatedStatements[0] = nodeFactory.createClassDeclaration(hostNode.decorators, undefined, hostNode.name, hostNode.typeParameters, hostNode.heritageClauses, hostNode.members);
    }
    const pureIife = (0, ast_utils_1.addPureComment)(nodeFactory.createImmediatelyInvokedArrowFunction([
        ...updatedStatements,
        nodeFactory.createReturnStatement(nodeFactory.createIdentifier(name)),
    ]));
    const modifiers = hostNode.modifiers;
    const isDefault = !!modifiers && modifiers.some((x) => x.kind === ts.SyntaxKind.DefaultKeyword);
    const newStatement = [];
    newStatement.push(nodeFactory.createVariableStatement(isDefault ? undefined : modifiers, nodeFactory.createVariableDeclarationList([nodeFactory.createVariableDeclaration(name, undefined, undefined, pureIife)], ts.NodeFlags.Let)));
    if (isDefault) {
        newStatement.push(nodeFactory.createExportAssignment(undefined, undefined, false, nodeFactory.createIdentifier(name)));
    }
    return newStatement;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid3JhcC1lbnVtcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2FuZ3VsYXJfZGV2a2l0L2J1aWxkX29wdGltaXplci9zcmMvdHJhbnNmb3Jtcy93cmFwLWVudW1zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7Ozs7O0dBTUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCwrQ0FBaUM7QUFDakMsb0RBQXNEO0FBRXRELFNBQVMsV0FBVyxDQUFDLElBQWE7SUFDaEMsT0FBTyxDQUNMLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxLQUFLO1FBQ2pDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxXQUFXO1FBQ3ZDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxVQUFVO1FBQ3RDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhO1FBQ3pDLElBQUksQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQ3ZDLENBQUM7QUFDSixDQUFDO0FBRUQsU0FBZ0IsdUJBQXVCO0lBQ3JDLE9BQU8sQ0FBQyxPQUFpQyxFQUFpQyxFQUFFO1FBQzFFLE1BQU0sV0FBVyxHQUFrQyxDQUFDLEVBQUUsRUFBRSxFQUFFO1lBQ3hELE1BQU0sTUFBTSxHQUFHLG9CQUFvQixDQUFDLEVBQUUsQ0FBQyxVQUFVLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFFNUQsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLGdCQUFnQixDQUFDLEVBQUUsRUFBRSxFQUFFLENBQUMsWUFBWSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztRQUN0RixDQUFDLENBQUM7UUFFRixPQUFPLFdBQVcsQ0FBQztJQUNyQixDQUFDLENBQUM7QUFDSixDQUFDO0FBVkQsMERBVUM7QUFFRCxTQUFTLG9CQUFvQixDQUMzQixVQUFzQyxFQUN0QyxPQUFpQztJQUVqQyxpREFBaUQ7SUFDakQsSUFBSSxpQkFBa0QsQ0FBQztJQUN2RCxNQUFNLFdBQVcsR0FBRyxPQUFPLENBQUMsT0FBTyxDQUFDO0lBRXBDLE1BQU0sT0FBTyxHQUFlLENBQUMsSUFBSSxFQUFFLEVBQUU7UUFDbkMsSUFBSSxXQUFXLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDckIsSUFBSSxNQUFNLEdBQUcsb0JBQW9CLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztZQUM1RCxJQUFJLE1BQU0sS0FBSyxJQUFJLENBQUMsVUFBVSxFQUFFO2dCQUM5QixPQUFPLElBQUksQ0FBQzthQUNiO1lBQ0QsTUFBTSxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztZQUNsRCxRQUFRLElBQUksQ0FBQyxJQUFJLEVBQUU7Z0JBQ2pCLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxLQUFLO29CQUN0QixPQUFPLFdBQVcsQ0FBQyxXQUFXLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUMvQyxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsV0FBVztvQkFDNUIsT0FBTyxXQUFXLENBQUMsaUJBQWlCLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO2dCQUNyRCxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsVUFBVTtvQkFDM0IsT0FBTyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ3JFLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxhQUFhO29CQUM5QixPQUFPLFdBQVcsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBQ3ZEO29CQUNFLE9BQU8sSUFBSSxDQUFDO2FBQ2Y7U0FDRjthQUFNO1lBQ0wsT0FBTyxJQUFJLENBQUM7U0FDYjtJQUNILENBQUMsQ0FBQztJQUVGLG9GQUFvRjtJQUNwRixLQUFLLElBQUksTUFBTSxHQUFHLENBQUMsRUFBRSxNQUFNLEdBQUcsQ0FBQyxFQUFFLE1BQU0sR0FBRyxVQUFVLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxNQUFNLEVBQUUsRUFBRSxNQUFNLEVBQUUsRUFBRTtRQUNuRixNQUFNLGdCQUFnQixHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUM1QyxJQUFJLFlBQXdDLENBQUM7UUFDN0MsSUFBSSxtQkFBbUIsR0FBRyxDQUFDLENBQUM7UUFFNUIsMENBQTBDO1FBQzFDLElBQUksZ0JBQWdCLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsaUJBQWlCLEVBQUU7WUFDN0QsU0FBUztTQUNWO1FBRUQsMEJBQTBCO1FBQzFCLDRCQUE0QjtRQUM1Qiw4QkFBOEI7UUFDOUIsZ0NBQWdDO1FBQ2hDLDhDQUE4QztRQUU5QyxxQ0FBcUM7UUFDckMsNEJBQTRCO1FBQzVCLDhCQUE4QjtRQUM5QixnQ0FBZ0M7UUFDaEMsOERBQThEO1FBQzlELCtDQUErQztRQUMvQyxJQUNFLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQyxnQkFBZ0IsQ0FBQztZQUN4QyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQzFEO1lBQ0EsTUFBTSxtQkFBbUIsR0FBRyxnQkFBZ0IsQ0FBQyxlQUFlLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQzdFLE1BQU0sV0FBVyxHQUFHLG1CQUFtQixDQUFDLFdBQVcsQ0FBQztZQUNwRCxJQUFJLEVBQUUsQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLEVBQUU7Z0JBQzdDLE1BQU0sSUFBSSxHQUFHLG1CQUFtQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7Z0JBRTNDLElBQUksQ0FBQyxXQUFXLEVBQUU7b0JBQ2hCLE1BQU0sSUFBSSxHQUFHLFlBQVksQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUN4RCxJQUFJLElBQUksRUFBRTt3QkFDUiwwREFBMEQ7d0JBQzFELG1CQUFtQixHQUFHLENBQUMsQ0FBQzt3QkFDeEIsWUFBWSxHQUFHLGNBQWMsQ0FBQyxXQUFXLEVBQUUsZ0JBQWdCLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUMvRSxzQkFBc0I7d0JBQ3RCLE1BQU0sRUFBRSxDQUFDO3FCQUNWO2lCQUNGO3FCQUFNLElBQ0wsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsQ0FBQztvQkFDakMsQ0FBQyxFQUFFLENBQUMsa0JBQWtCLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUMvRTtvQkFDQSxNQUFNLGVBQWUsR0FBRyxjQUFjLENBQUMsSUFBSSxFQUFFLFVBQVUsRUFBRSxNQUFNLENBQUMsQ0FBQztvQkFDakUsSUFBSSxDQUFDLGVBQWUsRUFBRTt3QkFDcEIsU0FBUztxQkFDVjtvQkFFRCxtQkFBbUIsR0FBRyxlQUFlLENBQUMsTUFBTSxDQUFDO29CQUM3QyxZQUFZLEdBQUcsa0JBQWtCLENBQUMsV0FBVyxFQUFFLG1CQUFtQixFQUFFLGVBQWUsQ0FBQyxDQUFDO29CQUVyRixNQUFNLElBQUksZUFBZSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7aUJBQ3RDO2FBQ0Y7U0FDRjthQUFNLElBQUksRUFBRSxDQUFDLGtCQUFrQixDQUFDLGdCQUFnQixDQUFDLEVBQUU7WUFDbEQsTUFBTSxJQUFJLEdBQUksZ0JBQWdCLENBQUMsSUFBc0IsQ0FBQyxJQUFJLENBQUM7WUFDM0QsTUFBTSxlQUFlLEdBQUcsY0FBYyxDQUFDLElBQUksRUFBRSxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7WUFDakUsSUFBSSxDQUFDLGVBQWUsRUFBRTtnQkFDcEIsU0FBUzthQUNWO1lBRUQsbUJBQW1CLEdBQUcsZUFBZSxDQUFDLE1BQU0sQ0FBQztZQUM3QyxZQUFZLEdBQUcsa0JBQWtCLENBQUMsV0FBVyxFQUFFLGdCQUFnQixFQUFFLGVBQWUsQ0FBQyxDQUFDO1lBRWxGLE1BQU0sSUFBSSxtQkFBbUIsR0FBRyxDQUFDLENBQUM7U0FDbkM7UUFFRCxJQUFJLFlBQVksSUFBSSxZQUFZLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtZQUMzQyxJQUFJLENBQUMsaUJBQWlCLEVBQUU7Z0JBQ3RCLGlCQUFpQixHQUFHLENBQUMsR0FBRyxVQUFVLENBQUMsQ0FBQzthQUNyQztZQUVELGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxNQUFNLEVBQUUsbUJBQW1CLEVBQUUsR0FBRyxZQUFZLENBQUMsQ0FBQztZQUN2RSwrQ0FBK0M7WUFDL0MscUNBQXFDO1lBQ3JDLE1BQU0sSUFBSSxZQUFZLENBQUMsQ0FBQyxDQUFDLFlBQVksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7U0FDdEQ7UUFFRCxNQUFNLE1BQU0sR0FBRyxFQUFFLENBQUMsU0FBUyxDQUFDLGdCQUFnQixFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBQ3ZELElBQUksTUFBTSxLQUFLLGdCQUFnQixFQUFFO1lBQy9CLElBQUksQ0FBQyxpQkFBaUIsRUFBRTtnQkFDdEIsaUJBQWlCLEdBQUcsVUFBVSxDQUFDLEtBQUssRUFBRSxDQUFDO2FBQ3hDO1lBQ0QsaUJBQWlCLENBQUMsTUFBTSxDQUFDLEdBQUcsTUFBTSxDQUFDO1NBQ3BDO0tBQ0Y7SUFFRCx3Q0FBd0M7SUFDeEMsNENBQTRDO0lBQzVDLE9BQU8saUJBQWlCLENBQUMsQ0FBQyxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDO0FBQ3pGLENBQUM7QUFFRCx1REFBdUQ7QUFDdkQsU0FBUyxZQUFZLENBQ25CLElBQVksRUFDWixTQUF1QjtJQUV2QixJQUFJLENBQUMsRUFBRSxDQUFDLHFCQUFxQixDQUFDLFNBQVMsQ0FBQyxFQUFFO1FBQ3hDLE9BQU8sSUFBSSxDQUFDO0tBQ2I7SUFFRCxNQUFNLFVBQVUsR0FBRyxTQUFTLENBQUMsVUFBVSxDQUFDO0lBQ3hDLElBQUksQ0FBQyxVQUFVLElBQUksQ0FBQyxFQUFFLENBQUMsZ0JBQWdCLENBQUMsVUFBVSxDQUFDLElBQUksVUFBVSxDQUFDLFNBQVMsQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1FBQ3hGLE9BQU8sSUFBSSxDQUFDO0tBQ2I7SUFFRCxNQUFNLGNBQWMsR0FBRyxVQUFVLENBQUM7SUFDbEMsSUFBSSxnQkFBMkMsQ0FBQztJQUVoRCxJQUFJLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLGNBQWMsQ0FBQyxVQUFVLENBQUMsRUFBRTtRQUM1RCxPQUFPLElBQUksQ0FBQztLQUNiO0lBRUQsTUFBTSxrQkFBa0IsR0FBRyxjQUFjLENBQUMsVUFBVSxDQUFDLFVBQVUsQ0FBQztJQUNoRSxJQUFJLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLGtCQUFrQixDQUFDLEVBQUU7UUFDaEQsT0FBTyxJQUFJLENBQUM7S0FDYjtJQUVELHlGQUF5RjtJQUN6Rix5QkFBeUI7SUFDekIsTUFBTSxTQUFTLEdBQUcsa0JBQWtCLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQyxDQUFDO0lBQ25ELElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUNwQyxPQUFPLElBQUksQ0FBQztLQUNiO0lBQ0QsTUFBTSxhQUFhLEdBQUcsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUM7SUFFMUMsSUFBSSxRQUFRLEdBQUcsY0FBYyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUMzQyxJQUNFLENBQUMsRUFBRSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQztRQUNoQyxDQUFDLEVBQUUsQ0FBQyxZQUFZLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQztRQUMvQixRQUFRLENBQUMsSUFBSSxDQUFDLElBQUksS0FBSyxJQUFJLEVBQzNCO1FBQ0EsT0FBTyxJQUFJLENBQUM7S0FDYjtJQUVELElBQUksZUFBZSxHQUFHLEtBQUssQ0FBQztJQUM1QixJQUFJLFFBQVEsQ0FBQyxhQUFhLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsZUFBZSxFQUFFO1FBQ2pFLElBQ0UsRUFBRSxDQUFDLGtCQUFrQixDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUM7WUFDckMsUUFBUSxDQUFDLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxVQUFVLENBQUMsV0FBVyxFQUMvRDtZQUNBLE9BQU8sSUFBSSxDQUFDO1NBQ2I7UUFFRCxlQUFlLEdBQUcsSUFBSSxDQUFDO1FBQ3ZCLFFBQVEsR0FBRyxRQUFRLENBQUMsS0FBSyxDQUFDO0tBQzNCO0lBRUQsSUFBSSxDQUFDLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxRQUFRLENBQUMsRUFBRTtRQUNwQyxPQUFPLElBQUksQ0FBQztLQUNiO0lBRUQsSUFBSSxRQUFRLENBQUMsYUFBYSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsVUFBVSxDQUFDLFdBQVcsRUFBRTtRQUM3RCxPQUFPLElBQUksQ0FBQztLQUNiO0lBRUQsSUFBSSxlQUFlLElBQUksQ0FBQyxFQUFFLENBQUMsWUFBWSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsRUFBRTtRQUN0RCxnQkFBZ0IsR0FBRyxRQUFRLENBQUMsSUFBSSxDQUFDO0tBQ2xDO0lBRUQsa0VBQWtFO0lBQ2xFLEtBQUssTUFBTSxTQUFTLElBQUksa0JBQWtCLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRTtRQUMxRCxJQUNFLENBQUMsRUFBRSxDQUFDLHFCQUFxQixDQUFDLFNBQVMsQ0FBQztZQUNwQyxDQUFDLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDO1lBQzVDLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLFNBQVMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLEVBQ3hEO1lBQ0EsT0FBTyxJQUFJLENBQUM7U0FDYjtRQUVELE1BQU0sY0FBYyxHQUFHLFNBQVMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQztRQUM1RCxJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxjQUFjLENBQUMsSUFBSSxjQUFjLENBQUMsSUFBSSxLQUFLLGFBQWEsRUFBRTtZQUM3RSxPQUFPLElBQUksQ0FBQztTQUNiO0tBQ0Y7SUFFRCxPQUFPLENBQUMsY0FBYyxFQUFFLGdCQUFnQixDQUFDLENBQUM7QUFDNUMsQ0FBQztBQUVELFNBQVMsY0FBYyxDQUNyQixXQUEyQixFQUMzQixRQUE4QixFQUM5QixVQUF5QjtJQUV6QiwrRkFBK0Y7SUFDL0YsTUFBTSxtQkFBbUIsR0FBRyxRQUFRLENBQUMsZUFBZSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUNyRSxNQUFNLFlBQVksR0FBRyxXQUFXLENBQUMsdUJBQXVCLENBQ3RELFFBQVEsRUFDUixRQUFRLENBQUMsU0FBUyxFQUNsQixXQUFXLENBQUMsNkJBQTZCLENBQUMsUUFBUSxDQUFDLGVBQWUsRUFBRTtRQUNsRSxXQUFXLENBQUMseUJBQXlCLENBQ25DLG1CQUFtQixFQUNuQixtQkFBbUIsQ0FBQyxJQUFJLEVBQ3hCLG1CQUFtQixDQUFDLGdCQUFnQixFQUNwQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQ3hCLFVBQVUsQ0FDWDtLQUNGLENBQUMsQ0FDSCxDQUFDO0lBRUYsT0FBTyxZQUFZLENBQUM7QUFDdEIsQ0FBQztBQUVEOzs7Ozs7Ozs7Ozs7R0FZRztBQUNILFNBQVMsY0FBYyxDQUNyQixJQUFZLEVBQ1osVUFBc0MsRUFDdEMsY0FBc0IsRUFDdEIsTUFBTSxHQUFHLENBQUM7SUFFVixJQUFJLEtBQUssR0FBRyxDQUFDLENBQUM7SUFFZCxLQUFLLElBQUksS0FBSyxHQUFHLGNBQWMsR0FBRyxDQUFDLEVBQUUsS0FBSyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxLQUFLLEVBQUU7UUFDdkUsTUFBTSxTQUFTLEdBQUcsVUFBVSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3BDLElBQUksQ0FBQyxFQUFFLENBQUMscUJBQXFCLENBQUMsU0FBUyxDQUFDLEVBQUU7WUFDeEMsTUFBTTtTQUNQO1FBRUQsTUFBTSxVQUFVLEdBQUcsU0FBUyxDQUFDLFVBQVUsQ0FBQztRQUV4QyxJQUFJLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsRUFBRTtZQUNuQyxNQUFNO1lBQ04sNENBQTRDO1lBQzVDLDZFQUE2RTtZQUM3RSxtRUFBbUU7WUFDbkUscUVBQXFFO1lBQ3JFLE1BQU0sSUFBSSxHQUFHLFVBQVUsQ0FBQyxTQUFTLENBQUM7WUFFbEMsSUFBSSxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtnQkFDbkIsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFO29CQUNyQyxNQUFNLG1CQUFtQixHQUFHLEVBQUUsQ0FBQywwQkFBMEIsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDO29CQUV0RixPQUFPLEVBQUUsQ0FBQyxZQUFZLENBQUMsbUJBQW1CLENBQUMsSUFBSSxtQkFBbUIsQ0FBQyxJQUFJLEtBQUssSUFBSSxDQUFDO2dCQUNuRixDQUFDLENBQUMsQ0FBQztnQkFFSCxJQUFJLFlBQVksRUFBRTtvQkFDaEIsS0FBSyxFQUFFLENBQUM7b0JBQ1IsU0FBUztpQkFDVjthQUNGO1NBQ0Y7YUFBTSxJQUFJLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsRUFBRTtZQUM1QyxNQUFNLElBQUksR0FBRyxFQUFFLENBQUMsa0JBQWtCLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQztZQUU3RixNQUFNLGNBQWMsR0FDbEIsRUFBRSxDQUFDLDBCQUEwQixDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyx5QkFBeUIsQ0FBQyxJQUFJLENBQUM7Z0JBQ3ZFLENBQUMsQ0FBQyw4Q0FBOEM7b0JBQzlDLDhGQUE4RjtvQkFDOUYsSUFBSSxDQUFDLFVBQVU7Z0JBQ2pCLENBQUMsQ0FBQyxzREFBc0Q7b0JBQ3RELElBQUksQ0FBQztZQUVYLElBQUksRUFBRSxDQUFDLFlBQVksQ0FBQyxjQUFjLENBQUMsSUFBSSxjQUFjLENBQUMsSUFBSSxLQUFLLElBQUksRUFBRTtnQkFDbkUsS0FBSyxFQUFFLENBQUM7Z0JBQ1IsU0FBUzthQUNWO1NBQ0Y7UUFFRCxNQUFNO0tBQ1A7SUFFRCxJQUFJLEtBQUssR0FBRyxDQUFDLEVBQUU7UUFDYixPQUFPLFVBQVUsQ0FBQyxLQUFLLENBQUMsY0FBYyxHQUFHLE1BQU0sRUFBRSxjQUFjLEdBQUcsS0FBSyxDQUFDLENBQUM7S0FDMUU7SUFFRCxPQUFPLFNBQVMsQ0FBQztBQUNuQixDQUFDO0FBRUQsU0FBUyxjQUFjLENBQ3JCLFdBQTJCLEVBQzNCLFFBQThCLEVBQzlCLElBQXVCLEVBQ3ZCLGdCQUFnQztJQUVoQyxJQUNFLENBQUMsRUFBRSxDQUFDLHlCQUF5QixDQUFDLElBQUksQ0FBQyxVQUFVLENBQUM7UUFDOUMsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsRUFDcEQ7UUFDQSxNQUFNLElBQUksS0FBSyxDQUFDLHdCQUF3QixDQUFDLENBQUM7S0FDM0M7SUFFRCw0REFBNEQ7SUFDNUQsSUFDRSxRQUFRLENBQUMsU0FBUztRQUNsQixRQUFRLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxFQUNoRjtRQUNBLGdCQUFnQixHQUFHLFNBQVMsQ0FBQztLQUM5QjtJQUVELE1BQU0sVUFBVSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsVUFBVSxDQUFDO0lBQzlDLE1BQU0sZUFBZSxHQUFHLFdBQVcsQ0FBQyx3QkFBd0IsQ0FDMUQsVUFBVSxFQUNWLFVBQVUsQ0FBQyxTQUFTLEVBQ3BCLFVBQVUsQ0FBQyxhQUFhLEVBQ3hCLFVBQVUsQ0FBQyxJQUFJLEVBQ2YsVUFBVSxDQUFDLGNBQWMsRUFDekIsVUFBVSxDQUFDLFVBQVUsRUFDckIsVUFBVSxDQUFDLElBQUksRUFDZixXQUFXLENBQUMsV0FBVyxDQUFDLFVBQVUsQ0FBQyxJQUFJLEVBQUU7UUFDdkMsR0FBRyxVQUFVLENBQUMsSUFBSSxDQUFDLFVBQVU7UUFDN0IsV0FBVyxDQUFDLHFCQUFxQixDQUFDLFVBQVUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBcUIsQ0FBQztLQUNsRixDQUFDLENBQ0gsQ0FBQztJQUVGLElBQUksR0FBRyxHQUFrQixXQUFXLENBQUMsNkJBQTZCLEVBQUUsQ0FBQztJQUNyRSxJQUFJLGdCQUFnQixFQUFFO1FBQ3BCLEdBQUcsR0FBRyxXQUFXLENBQUMsc0JBQXNCLENBQUMsZ0JBQWdCLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxXQUFXLEVBQUUsR0FBRyxDQUFDLENBQUM7S0FDNUY7SUFDRCxNQUFNLFdBQVcsR0FBRyxXQUFXLENBQUMsb0JBQW9CLENBQ2xELElBQUksRUFDSixXQUFXLENBQUMsNkJBQTZCLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxlQUFlLENBQUMsRUFDM0UsSUFBSSxDQUFDLGFBQWEsRUFDbEIsQ0FBQyxHQUFHLENBQUMsQ0FDTixDQUFDO0lBRUYsSUFBSSxLQUFLLEdBQWtCLElBQUEsMEJBQWMsRUFBQyxXQUFXLENBQUMsQ0FBQztJQUN2RCxJQUFJLGdCQUFnQixFQUFFO1FBQ3BCLEtBQUssR0FBRyxXQUFXLENBQUMsc0JBQXNCLENBQ3hDLGdCQUFnQixFQUNoQixFQUFFLENBQUMsVUFBVSxDQUFDLGVBQWUsRUFDN0IsV0FBVyxDQUNaLENBQUM7S0FDSDtJQUVELE9BQU8sQ0FBQyxjQUFjLENBQUMsV0FBVyxFQUFFLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQyxDQUFDO0FBQ3hELENBQUM7QUFFRCxTQUFTLGtCQUFrQixDQUN6QixXQUEyQixFQUMzQixRQUFzRCxFQUN0RCxVQUEwQjtJQUUxQixNQUFNLElBQUksR0FBSSxRQUFRLENBQUMsSUFBc0IsQ0FBQyxJQUFJLENBQUM7SUFFbkQsTUFBTSxpQkFBaUIsR0FBRyxDQUFDLEdBQUcsVUFBVSxDQUFDLENBQUM7SUFFMUMsSUFBSSxFQUFFLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDLEVBQUU7UUFDbkMsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLEdBQUcsV0FBVyxDQUFDLHNCQUFzQixDQUN2RCxRQUFRLENBQUMsVUFBVSxFQUNuQixTQUFTLEVBQ1QsUUFBUSxDQUFDLElBQUksRUFDYixRQUFRLENBQUMsY0FBYyxFQUN2QixRQUFRLENBQUMsZUFBZSxFQUN4QixRQUFRLENBQUMsT0FBTyxDQUNqQixDQUFDO0tBQ0g7SUFFRCxNQUFNLFFBQVEsR0FBRyxJQUFBLDBCQUFjLEVBQzdCLFdBQVcsQ0FBQyxxQ0FBcUMsQ0FBQztRQUNoRCxHQUFHLGlCQUFpQjtRQUNwQixXQUFXLENBQUMscUJBQXFCLENBQUMsV0FBVyxDQUFDLGdCQUFnQixDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ3RFLENBQUMsQ0FDSCxDQUFDO0lBRUYsTUFBTSxTQUFTLEdBQUcsUUFBUSxDQUFDLFNBQVMsQ0FBQztJQUNyQyxNQUFNLFNBQVMsR0FBRyxDQUFDLENBQUMsU0FBUyxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUMsQ0FBQztJQUVoRyxNQUFNLFlBQVksR0FBbUIsRUFBRSxDQUFDO0lBQ3hDLFlBQVksQ0FBQyxJQUFJLENBQ2YsV0FBVyxDQUFDLHVCQUF1QixDQUNqQyxTQUFTLENBQUMsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsU0FBUyxFQUNqQyxXQUFXLENBQUMsNkJBQTZCLENBQ3ZDLENBQUMsV0FBVyxDQUFDLHlCQUF5QixDQUFDLElBQUksRUFBRSxTQUFTLEVBQUUsU0FBUyxFQUFFLFFBQVEsQ0FBQyxDQUFDLEVBQzdFLEVBQUUsQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUNqQixDQUNGLENBQ0YsQ0FBQztJQUVGLElBQUksU0FBUyxFQUFFO1FBQ2IsWUFBWSxDQUFDLElBQUksQ0FDZixXQUFXLENBQUMsc0JBQXNCLENBQ2hDLFNBQVMsRUFDVCxTQUFTLEVBQ1QsS0FBSyxFQUNMLFdBQVcsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUMsQ0FDbkMsQ0FDRixDQUFDO0tBQ0g7SUFFRCxPQUFPLFlBQVksQ0FBQztBQUN0QixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCAqIGFzIHRzIGZyb20gJ3R5cGVzY3JpcHQnO1xuaW1wb3J0IHsgYWRkUHVyZUNvbW1lbnQgfSBmcm9tICcuLi9oZWxwZXJzL2FzdC11dGlscyc7XG5cbmZ1bmN0aW9uIGlzQmxvY2tMaWtlKG5vZGU6IHRzLk5vZGUpOiBub2RlIGlzIHRzLkJsb2NrTGlrZSB7XG4gIHJldHVybiAoXG4gICAgbm9kZS5raW5kID09PSB0cy5TeW50YXhLaW5kLkJsb2NrIHx8XG4gICAgbm9kZS5raW5kID09PSB0cy5TeW50YXhLaW5kLk1vZHVsZUJsb2NrIHx8XG4gICAgbm9kZS5raW5kID09PSB0cy5TeW50YXhLaW5kLkNhc2VDbGF1c2UgfHxcbiAgICBub2RlLmtpbmQgPT09IHRzLlN5bnRheEtpbmQuRGVmYXVsdENsYXVzZSB8fFxuICAgIG5vZGUua2luZCA9PT0gdHMuU3ludGF4S2luZC5Tb3VyY2VGaWxlXG4gICk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRXcmFwRW51bXNUcmFuc2Zvcm1lcigpOiB0cy5UcmFuc2Zvcm1lckZhY3Rvcnk8dHMuU291cmNlRmlsZT4ge1xuICByZXR1cm4gKGNvbnRleHQ6IHRzLlRyYW5zZm9ybWF0aW9uQ29udGV4dCk6IHRzLlRyYW5zZm9ybWVyPHRzLlNvdXJjZUZpbGU+ID0+IHtcbiAgICBjb25zdCB0cmFuc2Zvcm1lcjogdHMuVHJhbnNmb3JtZXI8dHMuU291cmNlRmlsZT4gPSAoc2YpID0+IHtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IHZpc2l0QmxvY2tTdGF0ZW1lbnRzKHNmLnN0YXRlbWVudHMsIGNvbnRleHQpO1xuXG4gICAgICByZXR1cm4gY29udGV4dC5mYWN0b3J5LnVwZGF0ZVNvdXJjZUZpbGUoc2YsIHRzLnNldFRleHRSYW5nZShyZXN1bHQsIHNmLnN0YXRlbWVudHMpKTtcbiAgICB9O1xuXG4gICAgcmV0dXJuIHRyYW5zZm9ybWVyO1xuICB9O1xufVxuXG5mdW5jdGlvbiB2aXNpdEJsb2NrU3RhdGVtZW50cyhcbiAgc3RhdGVtZW50czogdHMuTm9kZUFycmF5PHRzLlN0YXRlbWVudD4sXG4gIGNvbnRleHQ6IHRzLlRyYW5zZm9ybWF0aW9uQ29udGV4dCxcbik6IHRzLk5vZGVBcnJheTx0cy5TdGF0ZW1lbnQ+IHtcbiAgLy8gY29weSBvZiBzdGF0ZW1lbnRzIHRvIG1vZGlmeTsgbGF6eSBpbml0aWFsaXplZFxuICBsZXQgdXBkYXRlZFN0YXRlbWVudHM6IEFycmF5PHRzLlN0YXRlbWVudD4gfCB1bmRlZmluZWQ7XG4gIGNvbnN0IG5vZGVGYWN0b3J5ID0gY29udGV4dC5mYWN0b3J5O1xuXG4gIGNvbnN0IHZpc2l0b3I6IHRzLlZpc2l0b3IgPSAobm9kZSkgPT4ge1xuICAgIGlmIChpc0Jsb2NrTGlrZShub2RlKSkge1xuICAgICAgbGV0IHJlc3VsdCA9IHZpc2l0QmxvY2tTdGF0ZW1lbnRzKG5vZGUuc3RhdGVtZW50cywgY29udGV4dCk7XG4gICAgICBpZiAocmVzdWx0ID09PSBub2RlLnN0YXRlbWVudHMpIHtcbiAgICAgICAgcmV0dXJuIG5vZGU7XG4gICAgICB9XG4gICAgICByZXN1bHQgPSB0cy5zZXRUZXh0UmFuZ2UocmVzdWx0LCBub2RlLnN0YXRlbWVudHMpO1xuICAgICAgc3dpdGNoIChub2RlLmtpbmQpIHtcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkJsb2NrOlxuICAgICAgICAgIHJldHVybiBub2RlRmFjdG9yeS51cGRhdGVCbG9jayhub2RlLCByZXN1bHQpO1xuICAgICAgICBjYXNlIHRzLlN5bnRheEtpbmQuTW9kdWxlQmxvY2s6XG4gICAgICAgICAgcmV0dXJuIG5vZGVGYWN0b3J5LnVwZGF0ZU1vZHVsZUJsb2NrKG5vZGUsIHJlc3VsdCk7XG4gICAgICAgIGNhc2UgdHMuU3ludGF4S2luZC5DYXNlQ2xhdXNlOlxuICAgICAgICAgIHJldHVybiBub2RlRmFjdG9yeS51cGRhdGVDYXNlQ2xhdXNlKG5vZGUsIG5vZGUuZXhwcmVzc2lvbiwgcmVzdWx0KTtcbiAgICAgICAgY2FzZSB0cy5TeW50YXhLaW5kLkRlZmF1bHRDbGF1c2U6XG4gICAgICAgICAgcmV0dXJuIG5vZGVGYWN0b3J5LnVwZGF0ZURlZmF1bHRDbGF1c2Uobm9kZSwgcmVzdWx0KTtcbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICByZXR1cm4gbm9kZTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIG5vZGU7XG4gICAgfVxuICB9O1xuXG4gIC8vICdvSW5kZXgnIGlzIHRoZSBvcmlnaW5hbCBzdGF0ZW1lbnQgaW5kZXg7ICd1SW5kZXgnIGlzIHRoZSB1cGRhdGVkIHN0YXRlbWVudCBpbmRleFxuICBmb3IgKGxldCBvSW5kZXggPSAwLCB1SW5kZXggPSAwOyBvSW5kZXggPCBzdGF0ZW1lbnRzLmxlbmd0aCAtIDE7IG9JbmRleCsrLCB1SW5kZXgrKykge1xuICAgIGNvbnN0IGN1cnJlbnRTdGF0ZW1lbnQgPSBzdGF0ZW1lbnRzW29JbmRleF07XG4gICAgbGV0IG5ld1N0YXRlbWVudDogdHMuU3RhdGVtZW50W10gfCB1bmRlZmluZWQ7XG4gICAgbGV0IG9sZFN0YXRlbWVudHNMZW5ndGggPSAwO1xuXG4gICAgLy8gdGhlc2UgY2FuJ3QgY29udGFpbiBhbiBlbnVtIGRlY2xhcmF0aW9uXG4gICAgaWYgKGN1cnJlbnRTdGF0ZW1lbnQua2luZCA9PT0gdHMuU3ludGF4S2luZC5JbXBvcnREZWNsYXJhdGlvbikge1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gZW51bSBkZWNsYXJhdGlvbnMgbXVzdDpcbiAgICAvLyAgICogbm90IGJlIGxhc3Qgc3RhdGVtZW50XG4gICAgLy8gICAqIGJlIGEgdmFyaWFibGUgc3RhdGVtZW50XG4gICAgLy8gICAqIGhhdmUgb25seSBvbmUgZGVjbGFyYXRpb25cbiAgICAvLyAgICogaGF2ZSBhbiBpZGVudGlmZXIgYXMgYSBkZWNsYXJhdGlvbiBuYW1lXG5cbiAgICAvLyBDbGFzc0V4cHJlc3Npb24gZGVjbGFyYXRpb25zIG11c3Q6XG4gICAgLy8gICAqIG5vdCBiZSBsYXN0IHN0YXRlbWVudFxuICAgIC8vICAgKiBiZSBhIHZhcmlhYmxlIHN0YXRlbWVudFxuICAgIC8vICAgKiBoYXZlIG9ubHkgb25lIGRlY2xhcmF0aW9uXG4gICAgLy8gICAqIGhhdmUgYW4gQ2xhc3NFeHByZXNzaW9uIG9yIEJpbmFyeUV4cHJlc3Npb24gYW5kIGEgcmlnaHRcbiAgICAvLyAgICAgb2Yga2luZCBDbGFzc0V4cHJlc3Npb24gYXMgYSBpbml0aWFsaXplclxuICAgIGlmIChcbiAgICAgIHRzLmlzVmFyaWFibGVTdGF0ZW1lbnQoY3VycmVudFN0YXRlbWVudCkgJiZcbiAgICAgIGN1cnJlbnRTdGF0ZW1lbnQuZGVjbGFyYXRpb25MaXN0LmRlY2xhcmF0aW9ucy5sZW5ndGggPT09IDFcbiAgICApIHtcbiAgICAgIGNvbnN0IHZhcmlhYmxlRGVjbGFyYXRpb24gPSBjdXJyZW50U3RhdGVtZW50LmRlY2xhcmF0aW9uTGlzdC5kZWNsYXJhdGlvbnNbMF07XG4gICAgICBjb25zdCBpbml0aWFsaXplciA9IHZhcmlhYmxlRGVjbGFyYXRpb24uaW5pdGlhbGl6ZXI7XG4gICAgICBpZiAodHMuaXNJZGVudGlmaWVyKHZhcmlhYmxlRGVjbGFyYXRpb24ubmFtZSkpIHtcbiAgICAgICAgY29uc3QgbmFtZSA9IHZhcmlhYmxlRGVjbGFyYXRpb24ubmFtZS50ZXh0O1xuXG4gICAgICAgIGlmICghaW5pdGlhbGl6ZXIpIHtcbiAgICAgICAgICBjb25zdCBpaWZlID0gZmluZEVudW1JaWZlKG5hbWUsIHN0YXRlbWVudHNbb0luZGV4ICsgMV0pO1xuICAgICAgICAgIGlmIChpaWZlKSB7XG4gICAgICAgICAgICAvLyB1cGRhdGUgSUlGRSBhbmQgcmVwbGFjZSB2YXJpYWJsZSBzdGF0ZW1lbnQgYW5kIG9sZCBJSUZFXG4gICAgICAgICAgICBvbGRTdGF0ZW1lbnRzTGVuZ3RoID0gMjtcbiAgICAgICAgICAgIG5ld1N0YXRlbWVudCA9IHVwZGF0ZUVudW1JaWZlKG5vZGVGYWN0b3J5LCBjdXJyZW50U3RhdGVtZW50LCBpaWZlWzBdLCBpaWZlWzFdKTtcbiAgICAgICAgICAgIC8vIHNraXAgSUlGRSBzdGF0ZW1lbnRcbiAgICAgICAgICAgIG9JbmRleCsrO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICB0cy5pc0NsYXNzRXhwcmVzc2lvbihpbml0aWFsaXplcikgfHxcbiAgICAgICAgICAodHMuaXNCaW5hcnlFeHByZXNzaW9uKGluaXRpYWxpemVyKSAmJiB0cy5pc0NsYXNzRXhwcmVzc2lvbihpbml0aWFsaXplci5yaWdodCkpXG4gICAgICAgICkge1xuICAgICAgICAgIGNvbnN0IGNsYXNzU3RhdGVtZW50cyA9IGZpbmRTdGF0ZW1lbnRzKG5hbWUsIHN0YXRlbWVudHMsIG9JbmRleCk7XG4gICAgICAgICAgaWYgKCFjbGFzc1N0YXRlbWVudHMpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIG9sZFN0YXRlbWVudHNMZW5ndGggPSBjbGFzc1N0YXRlbWVudHMubGVuZ3RoO1xuICAgICAgICAgIG5ld1N0YXRlbWVudCA9IGNyZWF0ZVdyYXBwZWRDbGFzcyhub2RlRmFjdG9yeSwgdmFyaWFibGVEZWNsYXJhdGlvbiwgY2xhc3NTdGF0ZW1lbnRzKTtcblxuICAgICAgICAgIG9JbmRleCArPSBjbGFzc1N0YXRlbWVudHMubGVuZ3RoIC0gMTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH0gZWxzZSBpZiAodHMuaXNDbGFzc0RlY2xhcmF0aW9uKGN1cnJlbnRTdGF0ZW1lbnQpKSB7XG4gICAgICBjb25zdCBuYW1lID0gKGN1cnJlbnRTdGF0ZW1lbnQubmFtZSBhcyB0cy5JZGVudGlmaWVyKS50ZXh0O1xuICAgICAgY29uc3QgY2xhc3NTdGF0ZW1lbnRzID0gZmluZFN0YXRlbWVudHMobmFtZSwgc3RhdGVtZW50cywgb0luZGV4KTtcbiAgICAgIGlmICghY2xhc3NTdGF0ZW1lbnRzKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBvbGRTdGF0ZW1lbnRzTGVuZ3RoID0gY2xhc3NTdGF0ZW1lbnRzLmxlbmd0aDtcbiAgICAgIG5ld1N0YXRlbWVudCA9IGNyZWF0ZVdyYXBwZWRDbGFzcyhub2RlRmFjdG9yeSwgY3VycmVudFN0YXRlbWVudCwgY2xhc3NTdGF0ZW1lbnRzKTtcblxuICAgICAgb0luZGV4ICs9IG9sZFN0YXRlbWVudHNMZW5ndGggLSAxO1xuICAgIH1cblxuICAgIGlmIChuZXdTdGF0ZW1lbnQgJiYgbmV3U3RhdGVtZW50Lmxlbmd0aCA+IDApIHtcbiAgICAgIGlmICghdXBkYXRlZFN0YXRlbWVudHMpIHtcbiAgICAgICAgdXBkYXRlZFN0YXRlbWVudHMgPSBbLi4uc3RhdGVtZW50c107XG4gICAgICB9XG5cbiAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzLnNwbGljZSh1SW5kZXgsIG9sZFN0YXRlbWVudHNMZW5ndGgsIC4uLm5ld1N0YXRlbWVudCk7XG4gICAgICAvLyBXaGVuIGhhdmluZyBtb3JlIHRoYW4gYSBzaW5nbGUgbmV3IHN0YXRlbWVudFxuICAgICAgLy8gd2UgbmVlZCB0byB1cGRhdGUgdGhlIHVwZGF0ZSBJbmRleFxuICAgICAgdUluZGV4ICs9IG5ld1N0YXRlbWVudCA/IG5ld1N0YXRlbWVudC5sZW5ndGggLSAxIDogMDtcbiAgICB9XG5cbiAgICBjb25zdCByZXN1bHQgPSB0cy52aXNpdE5vZGUoY3VycmVudFN0YXRlbWVudCwgdmlzaXRvcik7XG4gICAgaWYgKHJlc3VsdCAhPT0gY3VycmVudFN0YXRlbWVudCkge1xuICAgICAgaWYgKCF1cGRhdGVkU3RhdGVtZW50cykge1xuICAgICAgICB1cGRhdGVkU3RhdGVtZW50cyA9IHN0YXRlbWVudHMuc2xpY2UoKTtcbiAgICAgIH1cbiAgICAgIHVwZGF0ZWRTdGF0ZW1lbnRzW3VJbmRleF0gPSByZXN1bHQ7XG4gICAgfVxuICB9XG5cbiAgLy8gaWYgY2hhbmdlcywgcmV0dXJuIHVwZGF0ZWQgc3RhdGVtZW50c1xuICAvLyBvdGhlcndpc2UsIHJldHVybiBvcmlnaW5hbCBhcnJheSBpbnN0YW5jZVxuICByZXR1cm4gdXBkYXRlZFN0YXRlbWVudHMgPyBub2RlRmFjdG9yeS5jcmVhdGVOb2RlQXJyYXkodXBkYXRlZFN0YXRlbWVudHMpIDogc3RhdGVtZW50cztcbn1cblxuLy8gVFMgMi4zIGVudW1zIGhhdmUgc3RhdGVtZW50cyB0aGF0IGFyZSBpbnNpZGUgYSBJSUZFLlxuZnVuY3Rpb24gZmluZEVudW1JaWZlKFxuICBuYW1lOiBzdHJpbmcsXG4gIHN0YXRlbWVudDogdHMuU3RhdGVtZW50LFxuKTogW3RzLkNhbGxFeHByZXNzaW9uLCB0cy5FeHByZXNzaW9uIHwgdW5kZWZpbmVkXSB8IG51bGwge1xuICBpZiAoIXRzLmlzRXhwcmVzc2lvblN0YXRlbWVudChzdGF0ZW1lbnQpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCBleHByZXNzaW9uID0gc3RhdGVtZW50LmV4cHJlc3Npb247XG4gIGlmICghZXhwcmVzc2lvbiB8fCAhdHMuaXNDYWxsRXhwcmVzc2lvbihleHByZXNzaW9uKSB8fCBleHByZXNzaW9uLmFyZ3VtZW50cy5sZW5ndGggIT09IDEpIHtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGNvbnN0IGNhbGxFeHByZXNzaW9uID0gZXhwcmVzc2lvbjtcbiAgbGV0IGV4cG9ydEV4cHJlc3Npb246IHRzLkV4cHJlc3Npb24gfCB1bmRlZmluZWQ7XG5cbiAgaWYgKCF0cy5pc1BhcmVudGhlc2l6ZWRFeHByZXNzaW9uKGNhbGxFeHByZXNzaW9uLmV4cHJlc3Npb24pKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCBmdW5jdGlvbkV4cHJlc3Npb24gPSBjYWxsRXhwcmVzc2lvbi5leHByZXNzaW9uLmV4cHJlc3Npb247XG4gIGlmICghdHMuaXNGdW5jdGlvbkV4cHJlc3Npb24oZnVuY3Rpb25FeHByZXNzaW9uKSkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgLy8gVGhlIG5hbWUgb2YgdGhlIHBhcmFtZXRlciBjYW4gYmUgZGlmZmVyZW50IHRoYW4gdGhlIG5hbWUgb2YgdGhlIGVudW0gaWYgaXQgd2FzIHJlbmFtZWRcbiAgLy8gZHVlIHRvIHNjb3BlIGhvaXN0aW5nLlxuICBjb25zdCBwYXJhbWV0ZXIgPSBmdW5jdGlvbkV4cHJlc3Npb24ucGFyYW1ldGVyc1swXTtcbiAgaWYgKCF0cy5pc0lkZW50aWZpZXIocGFyYW1ldGVyLm5hbWUpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgY29uc3QgcGFyYW1ldGVyTmFtZSA9IHBhcmFtZXRlci5uYW1lLnRleHQ7XG5cbiAgbGV0IGFyZ3VtZW50ID0gY2FsbEV4cHJlc3Npb24uYXJndW1lbnRzWzBdO1xuICBpZiAoXG4gICAgIXRzLmlzQmluYXJ5RXhwcmVzc2lvbihhcmd1bWVudCkgfHxcbiAgICAhdHMuaXNJZGVudGlmaWVyKGFyZ3VtZW50LmxlZnQpIHx8XG4gICAgYXJndW1lbnQubGVmdC50ZXh0ICE9PSBuYW1lXG4gICkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgbGV0IHBvdGVudGlhbEV4cG9ydCA9IGZhbHNlO1xuICBpZiAoYXJndW1lbnQub3BlcmF0b3JUb2tlbi5raW5kID09PSB0cy5TeW50YXhLaW5kLkZpcnN0QXNzaWdubWVudCkge1xuICAgIGlmIChcbiAgICAgIHRzLmlzQmluYXJ5RXhwcmVzc2lvbihhcmd1bWVudC5yaWdodCkgJiZcbiAgICAgIGFyZ3VtZW50LnJpZ2h0Lm9wZXJhdG9yVG9rZW4ua2luZCAhPT0gdHMuU3ludGF4S2luZC5CYXJCYXJUb2tlblxuICAgICkge1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgcG90ZW50aWFsRXhwb3J0ID0gdHJ1ZTtcbiAgICBhcmd1bWVudCA9IGFyZ3VtZW50LnJpZ2h0O1xuICB9XG5cbiAgaWYgKCF0cy5pc0JpbmFyeUV4cHJlc3Npb24oYXJndW1lbnQpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBpZiAoYXJndW1lbnQub3BlcmF0b3JUb2tlbi5raW5kICE9PSB0cy5TeW50YXhLaW5kLkJhckJhclRva2VuKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBpZiAocG90ZW50aWFsRXhwb3J0ICYmICF0cy5pc0lkZW50aWZpZXIoYXJndW1lbnQubGVmdCkpIHtcbiAgICBleHBvcnRFeHByZXNzaW9uID0gYXJndW1lbnQubGVmdDtcbiAgfVxuXG4gIC8vIEdvIHRocm91Z2ggYWxsIHRoZSBzdGF0ZW1lbnRzIGFuZCBjaGVjayB0aGF0IGFsbCBtYXRjaCB0aGUgbmFtZVxuICBmb3IgKGNvbnN0IHN0YXRlbWVudCBvZiBmdW5jdGlvbkV4cHJlc3Npb24uYm9keS5zdGF0ZW1lbnRzKSB7XG4gICAgaWYgKFxuICAgICAgIXRzLmlzRXhwcmVzc2lvblN0YXRlbWVudChzdGF0ZW1lbnQpIHx8XG4gICAgICAhdHMuaXNCaW5hcnlFeHByZXNzaW9uKHN0YXRlbWVudC5leHByZXNzaW9uKSB8fFxuICAgICAgIXRzLmlzRWxlbWVudEFjY2Vzc0V4cHJlc3Npb24oc3RhdGVtZW50LmV4cHJlc3Npb24ubGVmdClcbiAgICApIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IGxlZnRFeHByZXNzaW9uID0gc3RhdGVtZW50LmV4cHJlc3Npb24ubGVmdC5leHByZXNzaW9uO1xuICAgIGlmICghdHMuaXNJZGVudGlmaWVyKGxlZnRFeHByZXNzaW9uKSB8fCBsZWZ0RXhwcmVzc2lvbi50ZXh0ICE9PSBwYXJhbWV0ZXJOYW1lKSB7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gW2NhbGxFeHByZXNzaW9uLCBleHBvcnRFeHByZXNzaW9uXTtcbn1cblxuZnVuY3Rpb24gdXBkYXRlSG9zdE5vZGUoXG4gIG5vZGVGYWN0b3J5OiB0cy5Ob2RlRmFjdG9yeSxcbiAgaG9zdE5vZGU6IHRzLlZhcmlhYmxlU3RhdGVtZW50LFxuICBleHByZXNzaW9uOiB0cy5FeHByZXNzaW9uLFxuKTogdHMuU3RhdGVtZW50IHtcbiAgLy8gVXBkYXRlIGV4aXN0aW5nIGhvc3Qgbm9kZSB3aXRoIHRoZSBwdXJlIGNvbW1lbnQgYmVmb3JlIHRoZSB2YXJpYWJsZSBkZWNsYXJhdGlvbiBpbml0aWFsaXplci5cbiAgY29uc3QgdmFyaWFibGVEZWNsYXJhdGlvbiA9IGhvc3ROb2RlLmRlY2xhcmF0aW9uTGlzdC5kZWNsYXJhdGlvbnNbMF07XG4gIGNvbnN0IG91dGVyVmFyU3RtdCA9IG5vZGVGYWN0b3J5LnVwZGF0ZVZhcmlhYmxlU3RhdGVtZW50KFxuICAgIGhvc3ROb2RlLFxuICAgIGhvc3ROb2RlLm1vZGlmaWVycyxcbiAgICBub2RlRmFjdG9yeS51cGRhdGVWYXJpYWJsZURlY2xhcmF0aW9uTGlzdChob3N0Tm9kZS5kZWNsYXJhdGlvbkxpc3QsIFtcbiAgICAgIG5vZGVGYWN0b3J5LnVwZGF0ZVZhcmlhYmxlRGVjbGFyYXRpb24oXG4gICAgICAgIHZhcmlhYmxlRGVjbGFyYXRpb24sXG4gICAgICAgIHZhcmlhYmxlRGVjbGFyYXRpb24ubmFtZSxcbiAgICAgICAgdmFyaWFibGVEZWNsYXJhdGlvbi5leGNsYW1hdGlvblRva2VuLFxuICAgICAgICB2YXJpYWJsZURlY2xhcmF0aW9uLnR5cGUsXG4gICAgICAgIGV4cHJlc3Npb24sXG4gICAgICApLFxuICAgIF0pLFxuICApO1xuXG4gIHJldHVybiBvdXRlclZhclN0bXQ7XG59XG5cbi8qKlxuICogRmluZCBlbnVtcywgY2xhc3MgZXhwcmVzc2lvbiBvciBkZWNsYXJhdGlvbiBzdGF0ZW1lbnRzLlxuICpcbiAqIFRoZSBjbGFzc0V4cHJlc3Npb25zIGJsb2NrIHRvIHdyYXAgaW4gYW4gaWlmZSBtdXN0XG4gKiAtIGVuZCB3aXRoIGFuIEV4cHJlc3Npb25TdGF0ZW1lbnRcbiAqIC0gaXQncyBleHByZXNzaW9uIG11c3QgYmUgYSBCaW5hcnlFeHByZXNzaW9uXG4gKiAtIGhhdmUgdGhlIHNhbWUgbmFtZVxuICpcbiAqIGBgYFxuIGxldCBGb28gPSBjbGFzcyBGb28ge307XG4gRm9vID0gX19kZWNvcmF0ZShbXSk7XG4gYGBgXG4gKi9cbmZ1bmN0aW9uIGZpbmRTdGF0ZW1lbnRzKFxuICBuYW1lOiBzdHJpbmcsXG4gIHN0YXRlbWVudHM6IHRzLk5vZGVBcnJheTx0cy5TdGF0ZW1lbnQ+LFxuICBzdGF0ZW1lbnRJbmRleDogbnVtYmVyLFxuICBvZmZzZXQgPSAwLFxuKTogdHMuU3RhdGVtZW50W10gfCB1bmRlZmluZWQge1xuICBsZXQgY291bnQgPSAxO1xuXG4gIGZvciAobGV0IGluZGV4ID0gc3RhdGVtZW50SW5kZXggKyAxOyBpbmRleCA8IHN0YXRlbWVudHMubGVuZ3RoOyArK2luZGV4KSB7XG4gICAgY29uc3Qgc3RhdGVtZW50ID0gc3RhdGVtZW50c1tpbmRleF07XG4gICAgaWYgKCF0cy5pc0V4cHJlc3Npb25TdGF0ZW1lbnQoc3RhdGVtZW50KSkge1xuICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgY29uc3QgZXhwcmVzc2lvbiA9IHN0YXRlbWVudC5leHByZXNzaW9uO1xuXG4gICAgaWYgKHRzLmlzQ2FsbEV4cHJlc3Npb24oZXhwcmVzc2lvbikpIHtcbiAgICAgIC8vIEV4OlxuICAgICAgLy8gc2V0Q2xhc3NNZXRhZGF0YShGb29DbGFzcywgW3t9XSwgdm9pZCAwKTtcbiAgICAgIC8vIF9fZGVjb3JhdGUoW3Byb3BEZWNvcmF0b3IoKV0sIEZvb0NsYXNzLnByb3RvdHlwZSwgXCJwcm9wZXJ0eU5hbWVcIiwgdm9pZCAwKTtcbiAgICAgIC8vIF9fZGVjb3JhdGUoW3Byb3BEZWNvcmF0b3IoKV0sIEZvb0NsYXNzLCBcInByb3BlcnR5TmFtZVwiLCB2b2lkIDApO1xuICAgICAgLy8gX19kZWNvcmF0ZSQxKFtwcm9wRGVjb3JhdG9yKCldLCBGb29DbGFzcywgXCJwcm9wZXJ0eU5hbWVcIiwgdm9pZCAwKTtcbiAgICAgIGNvbnN0IGFyZ3MgPSBleHByZXNzaW9uLmFyZ3VtZW50cztcblxuICAgICAgaWYgKGFyZ3MubGVuZ3RoID4gMikge1xuICAgICAgICBjb25zdCBpc1JlZmVyZW5jZWQgPSBhcmdzLnNvbWUoKGFyZykgPT4ge1xuICAgICAgICAgIGNvbnN0IHBvdGVudGlhbElkZW50aWZpZXIgPSB0cy5pc1Byb3BlcnR5QWNjZXNzRXhwcmVzc2lvbihhcmcpID8gYXJnLmV4cHJlc3Npb24gOiBhcmc7XG5cbiAgICAgICAgICByZXR1cm4gdHMuaXNJZGVudGlmaWVyKHBvdGVudGlhbElkZW50aWZpZXIpICYmIHBvdGVudGlhbElkZW50aWZpZXIudGV4dCA9PT0gbmFtZTtcbiAgICAgICAgfSk7XG5cbiAgICAgICAgaWYgKGlzUmVmZXJlbmNlZCkge1xuICAgICAgICAgIGNvdW50Kys7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHRzLmlzQmluYXJ5RXhwcmVzc2lvbihleHByZXNzaW9uKSkge1xuICAgICAgY29uc3Qgbm9kZSA9IHRzLmlzQmluYXJ5RXhwcmVzc2lvbihleHByZXNzaW9uLmxlZnQpID8gZXhwcmVzc2lvbi5sZWZ0LmxlZnQgOiBleHByZXNzaW9uLmxlZnQ7XG5cbiAgICAgIGNvbnN0IGxlZnRFeHByZXNzaW9uID1cbiAgICAgICAgdHMuaXNQcm9wZXJ0eUFjY2Vzc0V4cHJlc3Npb24obm9kZSkgfHwgdHMuaXNFbGVtZW50QWNjZXNzRXhwcmVzc2lvbihub2RlKVxuICAgICAgICAgID8gLy8gU3RhdGljIFByb3BlcnRpZXMgLy8gRXg6IEZvby5iYXIgPSAndmFsdWUnO1xuICAgICAgICAgICAgLy8gRU5VTSBQcm9wZXJ0eSAvLyBFeDogIENoYW5nZURldGVjdGlvblN0cmF0ZWd5W0NoYW5nZURldGVjdGlvblN0cmF0ZWd5LkRlZmF1bHRdID0gXCJEZWZhdWx0XCI7XG4gICAgICAgICAgICBub2RlLmV4cHJlc3Npb25cbiAgICAgICAgICA6IC8vIEV4OiBGb29DbGFzcyA9IF9fZGVjb3JhdGUoW0NvbXBvbmVudCgpXSwgRm9vQ2xhc3MpO1xuICAgICAgICAgICAgbm9kZTtcblxuICAgICAgaWYgKHRzLmlzSWRlbnRpZmllcihsZWZ0RXhwcmVzc2lvbikgJiYgbGVmdEV4cHJlc3Npb24udGV4dCA9PT0gbmFtZSkge1xuICAgICAgICBjb3VudCsrO1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBicmVhaztcbiAgfVxuXG4gIGlmIChjb3VudCA+IDEpIHtcbiAgICByZXR1cm4gc3RhdGVtZW50cy5zbGljZShzdGF0ZW1lbnRJbmRleCArIG9mZnNldCwgc3RhdGVtZW50SW5kZXggKyBjb3VudCk7XG4gIH1cblxuICByZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiB1cGRhdGVFbnVtSWlmZShcbiAgbm9kZUZhY3Rvcnk6IHRzLk5vZGVGYWN0b3J5LFxuICBob3N0Tm9kZTogdHMuVmFyaWFibGVTdGF0ZW1lbnQsXG4gIGlpZmU6IHRzLkNhbGxFeHByZXNzaW9uLFxuICBleHBvcnRBc3NpZ25tZW50PzogdHMuRXhwcmVzc2lvbixcbik6IHRzLlN0YXRlbWVudFtdIHtcbiAgaWYgKFxuICAgICF0cy5pc1BhcmVudGhlc2l6ZWRFeHByZXNzaW9uKGlpZmUuZXhwcmVzc2lvbikgfHxcbiAgICAhdHMuaXNGdW5jdGlvbkV4cHJlc3Npb24oaWlmZS5leHByZXNzaW9uLmV4cHJlc3Npb24pXG4gICkge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBJSUZFIFN0cnVjdHVyZScpO1xuICB9XG5cbiAgLy8gSWdub3JlIGV4cG9ydCBhc3NpZ25tZW50IGlmIHZhcmlhYmxlIGlzIGRpcmVjdGx5IGV4cG9ydGVkXG4gIGlmIChcbiAgICBob3N0Tm9kZS5tb2RpZmllcnMgJiZcbiAgICBob3N0Tm9kZS5tb2RpZmllcnMuZmluZEluZGV4KChtKSA9PiBtLmtpbmQgPT0gdHMuU3ludGF4S2luZC5FeHBvcnRLZXl3b3JkKSAhPSAtMVxuICApIHtcbiAgICBleHBvcnRBc3NpZ25tZW50ID0gdW5kZWZpbmVkO1xuICB9XG5cbiAgY29uc3QgZXhwcmVzc2lvbiA9IGlpZmUuZXhwcmVzc2lvbi5leHByZXNzaW9uO1xuICBjb25zdCB1cGRhdGVkRnVuY3Rpb24gPSBub2RlRmFjdG9yeS51cGRhdGVGdW5jdGlvbkV4cHJlc3Npb24oXG4gICAgZXhwcmVzc2lvbixcbiAgICBleHByZXNzaW9uLm1vZGlmaWVycyxcbiAgICBleHByZXNzaW9uLmFzdGVyaXNrVG9rZW4sXG4gICAgZXhwcmVzc2lvbi5uYW1lLFxuICAgIGV4cHJlc3Npb24udHlwZVBhcmFtZXRlcnMsXG4gICAgZXhwcmVzc2lvbi5wYXJhbWV0ZXJzLFxuICAgIGV4cHJlc3Npb24udHlwZSxcbiAgICBub2RlRmFjdG9yeS51cGRhdGVCbG9jayhleHByZXNzaW9uLmJvZHksIFtcbiAgICAgIC4uLmV4cHJlc3Npb24uYm9keS5zdGF0ZW1lbnRzLFxuICAgICAgbm9kZUZhY3RvcnkuY3JlYXRlUmV0dXJuU3RhdGVtZW50KGV4cHJlc3Npb24ucGFyYW1ldGVyc1swXS5uYW1lIGFzIHRzLklkZW50aWZpZXIpLFxuICAgIF0pLFxuICApO1xuXG4gIGxldCBhcmc6IHRzLkV4cHJlc3Npb24gPSBub2RlRmFjdG9yeS5jcmVhdGVPYmplY3RMaXRlcmFsRXhwcmVzc2lvbigpO1xuICBpZiAoZXhwb3J0QXNzaWdubWVudCkge1xuICAgIGFyZyA9IG5vZGVGYWN0b3J5LmNyZWF0ZUJpbmFyeUV4cHJlc3Npb24oZXhwb3J0QXNzaWdubWVudCwgdHMuU3ludGF4S2luZC5CYXJCYXJUb2tlbiwgYXJnKTtcbiAgfVxuICBjb25zdCB1cGRhdGVkSWlmZSA9IG5vZGVGYWN0b3J5LnVwZGF0ZUNhbGxFeHByZXNzaW9uKFxuICAgIGlpZmUsXG4gICAgbm9kZUZhY3RvcnkudXBkYXRlUGFyZW50aGVzaXplZEV4cHJlc3Npb24oaWlmZS5leHByZXNzaW9uLCB1cGRhdGVkRnVuY3Rpb24pLFxuICAgIGlpZmUudHlwZUFyZ3VtZW50cyxcbiAgICBbYXJnXSxcbiAgKTtcblxuICBsZXQgdmFsdWU6IHRzLkV4cHJlc3Npb24gPSBhZGRQdXJlQ29tbWVudCh1cGRhdGVkSWlmZSk7XG4gIGlmIChleHBvcnRBc3NpZ25tZW50KSB7XG4gICAgdmFsdWUgPSBub2RlRmFjdG9yeS5jcmVhdGVCaW5hcnlFeHByZXNzaW9uKFxuICAgICAgZXhwb3J0QXNzaWdubWVudCxcbiAgICAgIHRzLlN5bnRheEtpbmQuRmlyc3RBc3NpZ25tZW50LFxuICAgICAgdXBkYXRlZElpZmUsXG4gICAgKTtcbiAgfVxuXG4gIHJldHVybiBbdXBkYXRlSG9zdE5vZGUobm9kZUZhY3RvcnksIGhvc3ROb2RlLCB2YWx1ZSldO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVXcmFwcGVkQ2xhc3MoXG4gIG5vZGVGYWN0b3J5OiB0cy5Ob2RlRmFjdG9yeSxcbiAgaG9zdE5vZGU6IHRzLkNsYXNzRGVjbGFyYXRpb24gfCB0cy5WYXJpYWJsZURlY2xhcmF0aW9uLFxuICBzdGF0ZW1lbnRzOiB0cy5TdGF0ZW1lbnRbXSxcbik6IHRzLlN0YXRlbWVudFtdIHtcbiAgY29uc3QgbmFtZSA9IChob3N0Tm9kZS5uYW1lIGFzIHRzLklkZW50aWZpZXIpLnRleHQ7XG5cbiAgY29uc3QgdXBkYXRlZFN0YXRlbWVudHMgPSBbLi4uc3RhdGVtZW50c107XG5cbiAgaWYgKHRzLmlzQ2xhc3NEZWNsYXJhdGlvbihob3N0Tm9kZSkpIHtcbiAgICB1cGRhdGVkU3RhdGVtZW50c1swXSA9IG5vZGVGYWN0b3J5LmNyZWF0ZUNsYXNzRGVjbGFyYXRpb24oXG4gICAgICBob3N0Tm9kZS5kZWNvcmF0b3JzLFxuICAgICAgdW5kZWZpbmVkLFxuICAgICAgaG9zdE5vZGUubmFtZSxcbiAgICAgIGhvc3ROb2RlLnR5cGVQYXJhbWV0ZXJzLFxuICAgICAgaG9zdE5vZGUuaGVyaXRhZ2VDbGF1c2VzLFxuICAgICAgaG9zdE5vZGUubWVtYmVycyxcbiAgICApO1xuICB9XG5cbiAgY29uc3QgcHVyZUlpZmUgPSBhZGRQdXJlQ29tbWVudChcbiAgICBub2RlRmFjdG9yeS5jcmVhdGVJbW1lZGlhdGVseUludm9rZWRBcnJvd0Z1bmN0aW9uKFtcbiAgICAgIC4uLnVwZGF0ZWRTdGF0ZW1lbnRzLFxuICAgICAgbm9kZUZhY3RvcnkuY3JlYXRlUmV0dXJuU3RhdGVtZW50KG5vZGVGYWN0b3J5LmNyZWF0ZUlkZW50aWZpZXIobmFtZSkpLFxuICAgIF0pLFxuICApO1xuXG4gIGNvbnN0IG1vZGlmaWVycyA9IGhvc3ROb2RlLm1vZGlmaWVycztcbiAgY29uc3QgaXNEZWZhdWx0ID0gISFtb2RpZmllcnMgJiYgbW9kaWZpZXJzLnNvbWUoKHgpID0+IHgua2luZCA9PT0gdHMuU3ludGF4S2luZC5EZWZhdWx0S2V5d29yZCk7XG5cbiAgY29uc3QgbmV3U3RhdGVtZW50OiB0cy5TdGF0ZW1lbnRbXSA9IFtdO1xuICBuZXdTdGF0ZW1lbnQucHVzaChcbiAgICBub2RlRmFjdG9yeS5jcmVhdGVWYXJpYWJsZVN0YXRlbWVudChcbiAgICAgIGlzRGVmYXVsdCA/IHVuZGVmaW5lZCA6IG1vZGlmaWVycyxcbiAgICAgIG5vZGVGYWN0b3J5LmNyZWF0ZVZhcmlhYmxlRGVjbGFyYXRpb25MaXN0KFxuICAgICAgICBbbm9kZUZhY3RvcnkuY3JlYXRlVmFyaWFibGVEZWNsYXJhdGlvbihuYW1lLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgcHVyZUlpZmUpXSxcbiAgICAgICAgdHMuTm9kZUZsYWdzLkxldCxcbiAgICAgICksXG4gICAgKSxcbiAgKTtcblxuICBpZiAoaXNEZWZhdWx0KSB7XG4gICAgbmV3U3RhdGVtZW50LnB1c2goXG4gICAgICBub2RlRmFjdG9yeS5jcmVhdGVFeHBvcnRBc3NpZ25tZW50KFxuICAgICAgICB1bmRlZmluZWQsXG4gICAgICAgIHVuZGVmaW5lZCxcbiAgICAgICAgZmFsc2UsXG4gICAgICAgIG5vZGVGYWN0b3J5LmNyZWF0ZUlkZW50aWZpZXIobmFtZSksXG4gICAgICApLFxuICAgICk7XG4gIH1cblxuICByZXR1cm4gbmV3U3RhdGVtZW50O1xufVxuIl19