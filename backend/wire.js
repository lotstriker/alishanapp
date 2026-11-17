'use strict';
// JSON transport preserving Dates, Maps, Sets, undefined and non-finite values.
function encode(value) {
  if (value === undefined) return { $alishan: 'undefined' };
  if (value instanceof Date || Object.prototype.toString.call(value) === '[object Date]') return { $alishan: 'date', value: Number.isNaN(+value) ? null : value.toISOString() };
  if (typeof value === 'number' && !Number.isFinite(value)) return { $alishan: 'number', value: String(value) };
  if (Object.prototype.toString.call(value) === '[object Map]') return { $alishan: 'map', value: [...value].map(encode) };
  if (Object.prototype.toString.call(value) === '[object Set]') return { $alishan: 'set', value: [...value].map(encode) };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,encode(v)]));
  if (typeof value === 'function') throw new Error('Functions cannot cross the server boundary');
  return value;
}
function decode(value) {
  if (!value || typeof value !== 'object') return value;
  if (value.$alishan === 'date') return new Date(value.value === null ? NaN : value.value);
  if (value.$alishan === 'undefined') return undefined;
  if (value.$alishan === 'number') return Number(value.value);
  if (value.$alishan === 'map') return new Map(value.value.map(decode));
  if (value.$alishan === 'set') return new Set(value.value.map(decode));
  if (Array.isArray(value)) return value.map(decode);
  return Object.fromEntries(Object.entries(value).map(([k,v]) => [k,decode(v)]));
}
module.exports = { encode, decode };
