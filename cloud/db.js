/** D1 usa parámetros posicionales. Los nombres solo proceden de SQL del servidor. */
export function statement(db, sql, params = []) {
  let values = params;
  if (!Array.isArray(params)) {
    values = [];
    sql = sql.replace(/@([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
      if (!(name in params)) throw new Error(`Falta el parámetro ${name}`);
      values.push(params[name]);
      return '?';
    });
  }
  const prepared = db.prepare(sql);
  return values.length ? prepared.bind(...values) : prepared;
}
export const first = (db, sql, params) => statement(db, sql, params).first();
export const all = async (db, sql, params) => (await statement(db, sql, params).all()).results;
export const run = (db, sql, params) => statement(db, sql, params).run();
export async function sha256(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}
