// Publicly shareable credentials for a FICTIONAL ISOLATED QA tenant only.
// Never use these accounts for real staff, real company or sensitive information.
// Managers and employees have different credentials, and company-scoped RLS applies.
export const ORG_QA_COMPANY='Workforce QA 星河服務股份有限公司（虛構）';
export const ORG_QA_COMPANY_B='Workforce QA 海角工作室（虛構）';
export const ORG_QA_USERS=[
 {id:'owner',name:'陳總經理',email:'wforg.qa.20261106.owner@example.com',password:'WfQA!2026-Own-X7q',role:'owner',code:'QA-OWNER',title:'企業總管理者',parent:null,department:'營運部',tenant:'A'},
 {id:'hr',name:'黃人資',email:'wforg.qa.20261106.hr@example.com',password:'WfQA!2026-HR-T9v',role:'hr',code:'QA-HR',title:'人資主管',parent:'owner',department:'營運部',tenant:'A'},
 {id:'manager',name:'王營運經理',email:'wforg.qa.20261106.manager@example.com',password:'WfQA!2026-Mgr-R8m',role:'manager',code:'QA-MGR',title:'營運部經理',parent:'owner',department:'營運部',tenant:'A'},
 {id:'lead',name:'林門市組長',email:'wforg.qa.20261106.lead@example.com',password:'WfQA!2026-Lead-K4p',role:'manager',code:'QA-LEAD',title:'門市組長',parent:'manager',department:'營運部',tenant:'A'},
 {id:'staffA',name:'張一凡',email:'wforg.qa.20261106.staffa@example.com',password:'WfQA!2026-A-L6s',role:'employee',code:'QA-001',title:'門市專員',parent:'lead',department:'營運部',tenant:'A'},
 {id:'staffB',name:'李小晴',email:'wforg.qa.20261106.staffb@example.com',password:'WfQA!2026-B-N3y',role:'employee',code:'QA-002',title:'營運助理',parent:'manager',department:'營運部',tenant:'A'},
 {id:'otherManager',name:'周客服主管',email:'wforg.qa.20261106.othermanager@example.com',password:'WfQA!2026-OM-H7z',role:'manager',code:'QA-CSM',title:'客服部主管',parent:'owner',department:'客服部',tenant:'A'},
 {id:'otherStaff',name:'吳客服',email:'wforg.qa.20261106.otherstaff@example.com',password:'WfQA!2026-OS-C5n',role:'employee',code:'QA-CS1',title:'客服專員',parent:'otherManager',department:'客服部',tenant:'A'},
 {id:'external',name:'蔡工作室負責人',email:'wforg.qa.20261106.external@example.com',password:'WfQA!2026-Ext-P2w',role:'owner',code:'QA-EXT',title:'另一家企業總管理者',parent:null,department:'',tenant:'B'}
];
