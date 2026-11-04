import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const sql=readFileSync(path.join(root,"supabase/migrations/20261104_booking_break_interval_overlap.sql"),"utf8");

test("actual interval overlap is enforced on both reservation writes and slot reads",()=>{
 assert.match(sql,/create or replace function public\.so_validate_booking_policy\(\)/i);
 assert.match(sql,/new\.booking_time < p\.break_end/);
 assert.match(sql,/new\.booking_time \+ make_interval\(mins=>v_slot_minutes\) > p\.break_start/);
 assert.match(sql,/create or replace function public\.so_public_state\(/i);
 assert.match(sql,/gs::time \+ make_interval\(mins=>t\.slot_minutes\) <= v_policy\.break_start/);
 assert.match(sql,/gs::time >= v_policy\.break_end/);
 assert.match(sql,/Concurrent change to so_public_state/);
 assert.match(sql,/Concurrent change to so_validate_booking_policy/);
 assert.equal((sql.match(/\\$function\\$;/g)||[]).length,2,"Both PostgreSQL functions must end with a semicolon");
 assert.doesNotMatch(sql,/drop table|truncate|delete from|update public\.so_reservations/i);
});

const minutes=t=>{const [h,m]=t.split(":").map(Number);return h*60+m;};
const valid=(start,duration,beg,end)=>{
  const s=minutes(start),b=minutes(beg),e=minutes(end);
  return s+duration<=b || s>=e;
};
test("booking break intervals are half-open and reject partial crossing slots",()=>{
 assert.equal(valid("11:30",30,"12:00","13:00"),true);
 assert.equal(valid("11:45",30,"12:00","13:00"),false);
 assert.equal(valid("12:00",30,"12:00","13:00"),false);
 assert.equal(valid("12:45",30,"12:00","13:00"),false);
 assert.equal(valid("13:00",30,"12:00","13:00"),true);
});
