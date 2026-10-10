export type Report = {id:string;reference:string;user_id:string|null;location:string;description:string;severity:number;criticality:number;priority:number;status:string;latitude:number;longitude:number;photo_path:string|null;team:string|null;is_demo:boolean;created_at:string};
export const severityLabel = (n:number) => ['Low','Moderate','Critical'][n-1] ?? 'Low';
export const priorityScore = (severity:number,criticality:number) => severity*20+criticality*10;
export const sortReports = (reports:Report[]) => [...reports].sort((a,b)=>b.priority-a.priority || a.created_at.localeCompare(b.created_at));
