import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

const records = new Map();
let verifyCall = null;
globalThis.__passkeySizeTestStore = {
  async get(key) { return structuredClone(records.get(key) ?? null); },
  async setJSON(key, value) { records.set(key, structuredClone(value)); return { modified:true }; },
  async delete(key) { records.delete(key); },
  async list() { return { blobs:[] }; },
};
globalThis.__passkeySizeVerify = options => {
  verifyCall = options;
  return { verified:true, authenticationInfo:{ newCounter:7 } };
};
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@netlify/blobs') return {
    url:'data:text/javascript,export function getStore(){return globalThis.__passkeySizeTestStore}',
    shortCircuit:true,
  };
  if (specifier === '@simplewebauthn/server') return {
    url:'data:text/javascript,' + encodeURIComponent(