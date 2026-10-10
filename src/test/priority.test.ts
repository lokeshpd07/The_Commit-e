import {describe,it,expect} from 'vitest';
import {priorityScore,sortReports,type Report} from '../lib/reports';
describe('severity and criticality prioritization',()=>{
 it('increases priority with severity',()=>expect(priorityScore(3,1)).toBeGreaterThan(priorityScore(2,1)));
 it('increases priority with criticality',()=>expect(priorityScore(2,3)).toBeGreaterThan(priorityScore(2,1)));
 it('puts the most severe and critical report first',()=>{const rows=[{priority:30,created_at:'2026-01-01'},{priority:90,created_at:'2026-01-02'}] as Report[];expect(sortReports(rows)[0]?.priority).toBe(90);});
});
