"use strict";
/// <reference types="@figma/plugin-typings" />
const SCHEMA_VERSION = 1;
const KNOWN_VARIABLE_TYPES = new Set([
    "COLOR",
    "FLOAT",
    "STRING",
    "BOOLEAN",
]);
main();
async function main() {
    try {
        const payload = await buildExport();
        if (payload.variables.length === 0) {
            figma.closePlugin("Add variables or open a different Figma file.");
            return;
        }
        const variables = payload.variables.length;
        const collections = payload.collections.length;
        figma.showUI(__html__, { visible: false });
        figma.ui.postMessage({
            type: "download",
            filename: `tokens-${isoDate()}.json`,
            json: JSON.stringify(payload, null, 2),
        });
        figma.ui.onmessage = () => {
            figma.closePlugin(`Exported ${variables} ${plural(variables, "variable")} from ${collections} ${plural(collections, "collection")}`);
        };
    }
    catch (err) {
        console.error("[Raw Tokens Exporter] export failed", err);
        figma.closePlugin("Couldn't export variables. Please try again, or contact support if the issue persists.");
    }
}
async function buildExport() {
    const [collections, variables] = await Promise.all([
        figma.variables.getLocalVariableCollectionsAsync(),
        figma.variables.getLocalVariablesAsync(),
    ]);
    return {
        schemaVersion: SCHEMA_VERSION,
        collections: collections.map(serializeCollection),
        variables: variables.map(serializeVariable),
    };
}
function serializeCollection(c) {
    return {
        id: c.id,
        name: c.name,
        modes: c.modes.map((m) => ({ id: m.modeId, name: m.name })),
        defaultModeId: c.defaultModeId,
    };
}
function serializeVariable(v) {
    const type = v.resolvedType;
    if (!KNOWN_VARIABLE_TYPES.has(type)) {
        console.warn(`[Raw Tokens Exporter] unknown variable type "${type}" on "${v.name}"`);
    }
    const valuesByMode = {};
    for (const [modeId, raw] of Object.entries(v.valuesByMode)) {
        valuesByMode[modeId] = serializeValue(raw);
    }
    return {
        id: v.id,
        name: v.name,
        description: v.description,
        collectionId: v.variableCollectionId,
        type,
        scopes: v.scopes,
        valuesByMode,
    };
}
function serializeValue(value) {
    if (isAlias(value))
        return { kind: "alias", variableId: value.id };
    if (typeof value === "object" && value !== null && "r" in value) {
        const rgba = "a" in value ? value : { r: value.r, g: value.g, b: value.b, a: 1 };
        return { kind: "literal", value: rgba };
    }
    return { kind: "literal", value };
}
function isAlias(value) {
    return (typeof value === "object" &&
        value !== null &&
        "type" in value &&
        value.type === "VARIABLE_ALIAS");
}
function plural(n, word) {
    return n === 1 ? word : `${word}s`;
}
function isoDate() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
function pad2(n) {
    return n < 10 ? `0${n}` : String(n);
}
