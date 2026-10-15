# M+Church 培育系統 × 同工協作 × 通知排程｜Codex Implementation Brief

> Status: approved product direction. This document is an implementation brief for Codex.
> Safety: first inspect the existing repository/schema. Do not modify production data or introduce duplicate people/member records. Implement incrementally.

## 1. Goal

Add a Training & Discipleship module to the existing M+Church MANAGEMENT system and integrate it with the staff collaboration/task system and a reusable notification scheduling/automation layer.

Core operating model:

```
DATA → DOMAIN EVENT → ACTION/TASK → ASSIGNEE → DEADLINE → REMINDER → FOLLOW-UP
```

Do not build a passive "data → table" module. Important church data should be able to trigger the next pastoral/administrative action.

## 2. Mandatory discovery before implementation

Before writing migrations or large code changes, inspect and report:

- existing member/person/visitor schema and IDs
- auth and RBAC
- Supabase usage and migration conventions
- current task/collaboration features
- notification and LINE integration
- audit log
- existing UI components/design patterns
- current deployment constraints

Return: CURRENT ARCHITECTURE, REUSABLE COMPONENTS, SCHEMA IMPACT, RISKS, IMPLEMENTATION PLAN.

Reuse existing person/member IDs. Do NOT create a duplicate training_people table or duplicate names/phones/profile data.

## 3. Core discipleship path

1. 成長營 — open to anyone, including new visitors
2. 成長班 — prerequisite: 成長營 completed
3. 門徒營 — prerequisite: 成長班 completed
4. 門徒班 — prerequisite: 門徒營 completed
5. 精兵營 — prerequisite: 門徒班 completed
6. 領袖班 — prerequisite: 精兵營 completed

Only status `completed` satisfies a prerequisite.

Enrollment/attendance/in-progress/leave/makeup/not-completed do not unlock the next course.

A person may repeat a course. If any historical enrollment for that course is completed, the prerequisite is satisfied.

## 4. Data-driven model

Do not hard-code the six-course chain in frontend logic.

Suggested entities (adapt naming to repository conventions):

### training_courses
- id
- name
- code
- description
- level
- is_active
- sort_order
- primary_owner / owner reference if appropriate
- team_id if existing team model supports it
- created_at / updated_at

Seed:
- GROWTH_CAMP / 成長營 / 1
- GROWTH_CLASS / 成長班 / 2
- DISCIPLE_CAMP / 門徒營 / 3
- DISCIPLE_CLASS / 門徒班 / 4
- WARRIOR_CAMP / 精兵營 / 5
- LEADER_CLASS / 領袖班 / 6

### training_prerequisites
- id
- course_id
- required_course_id
- requirement_type
- created_at

### training_sessions
Represents a real cohort/term.
- id
- course_id
- name
- start_date
- end_date
- registration_start_at
- registration_deadline
- location
- capacity
- leader_person_id
- status: draft | registration | in_progress | completed | cancelled
- description
- created_by
- timestamps

### training_enrollments
- id
- session_id
- person_id
- status: registered | in_progress | completed | not_completed | withdrawn | leave | makeup_required
- registered_at
- completed_at
- completion_note
- created_by
- timestamps

### training_attendance
- id
- enrollment_id
- session_date
- attendance_status: present | absent | leave | makeup
- note
- timestamps

Support legacy/historical completion records so existing discipleship history can be entered without reconstructing every old cohort.

## 5. Eligibility service

Create one reusable server-side eligibility service, conceptually:

`canEnroll(personId, courseId)`

Return:
- eligible
- missingPrerequisites[]
- completedPrerequisites[]
- reason

Frontend may display eligibility, but enrollment writes MUST validate again server-side.

Admin/pastor/training-leader override is allowed only with:
- explicit special approval
- required reason
- approved_by
- approved_at
- audit log

## 6. UI

Add 培育系統 to the existing MANAGEMENT navigation using the current design system.

### Person detail
Show 培育歷程:
- each of six stages
- completed date
- current/eligible/locked state
- next recommended stage

Example:
- ✅ 成長營
- ✅ 成長班
- ✅ 門徒營
- 🔵 門徒班：可報名
- 🔒 精兵營
- 🔒 領袖班
- 下一步：門徒班

### Training dashboard
For each stage show:
- completed count
- in-progress count
- eligible-for-next count

Add "待推進培育":
- completed 成長營 but not 成長班
- completed 成長班 but not 門徒營
- etc.
Click counts to open the actual people list.

### Session management
Support:
- create/edit cohort
- open/close registration
- add/remove students
- eligibility display
- capacity
- attendance
- individual/bulk completion
- not completed
- makeup
- history

### Filters
Search/filter by:
- person
- course
- stage
- completed/in-progress/eligible/locked
- group (if existing)
- visitor/member type
- session
- year

## 7. Staff collaboration integration

Training events must create actionable work through the existing/shared collaboration layer.

Conceptual flow:

```
training event
→ automation rule
→ task
→ assignee/team
→ deadline
→ reminders
→ follow-up result
→ completion/escalation
```

A training follow-up task should support outcomes beyond done/not-done:
- 已聯絡
- 有意願
- 等待回覆
- 暫時不參加
- 無法聯絡
- 已報名
- 已完成

Course ownership should be configurable, not hard-coded to names.

Assignee strategies should be reusable:
- course owner
- team
- group leader
- specific role
- pastor
- pastor + spouse

## 8. Shared domain events

Build/reuse a common event layer rather than page-specific notification code.

Training events:
- training.eligible
- training.registration_open
- training.registered
- training.starting_soon
- training.absent
- training.makeup_required
- training.completed
- training.not_completed
- training.followup_required
- training.session_completed

The same infrastructure must later support:
- visitor.created
- care.followup_required
- member.absent
- baptism.registered
- event.created
- birthday.upcoming

## 9. Notification scheduler

Use/build one reusable scheduler. Support:
- immediate
- specified datetime
- N days/hours before event
- N days after event
- before deadline
- at deadline
- overdue
- recurring reminder
- condition-based reminder

Channels should be abstracted:
- IN_APP
- LINE
- EMAIL
Future: PUSH/SMS if needed.

Notification state:
- pending
- scheduled
- sent
- failed
- cancelled
- read

Store scheduled_at, sent_at, channel, recipient, related entity type/id.

## 10. Condition re-check and cancellation

Scheduled notifications MUST re-check the condition at execution time.

Example: if a reminder to register is scheduled for Oct 1 but the person registers on Sep 28, cancel/suppress the reminder.

Implement deduplication so the same person/event/task/notification type is not repeatedly sent within an inappropriate interval.

## 11. Task reminder + escalation

Example:
- task created → immediate notification
- deadline -2 days → reminder
- deadline day → reminder
- overdue +1 day → overdue reminder
- overdue +3 days → optional escalation

Escalation must be configurable:
- none
- team_leader
- ministry_leader
- pastor
- custom

Do NOT send every small exception to the pastor.

## 12. Visitor integration requirement

The same automation engine must support the previously approved new-visitor workflow:

```
visitor.created
→ notify pastor + pastor's spouse
→ create new-visitor care task
→ follow-up deadline
→ reminders while incomplete
→ stop reminders when completed
→ escalate only according to configured rule
```

Do not create a second scheduling engine specifically for visitors.

## 13. Training completion workflow

When enrollment becomes completed:
1. persist completion
2. eligibility service naturally unlocks next course
3. emit training.completed / training.eligible as appropriate
4. if next course exists, create or propose follow-up task according to automation rules
5. if an open session exists, surface it
6. if no session exists, show "已符合資格，等待下一梯次"

Do not persist redundant "eligible=true" records if eligibility can be derived safely from completion history.

## 14. Stalled discipleship

Support a configurable stalled-training rule.

Example: completed a stage but no enrollment in the next stage for 180 days.

Surface first to the training leader dashboard. Optionally create a follow-up task. Do not automatically flood pastor notifications.

## 15. Staff workbench

"今日工作台" should surface:
- visitor care
- training follow-up
- event preparation
- overdue work

Training task views:
- 待聯絡
- 已聯絡
- 等待回覆
- 已報名
- 暫不參加
- 無法聯絡
- 已完成
- 逾期

Filters: today / this week / overdue / course / session.

## 16. Pastor dashboard

Pastor dashboard should emphasize exceptions, not every task.

Examples:
- 本週新進培育
- 等待下一階段
- 尚未跟進
- 跟進逾期
- 即將開課
- 需要牧師本人處理

## 17. Pastor Assistant readiness

Provide clean service/query interfaces so a future AI assistant can answer safely without composing arbitrary complex SQL:

- Who is eligible for the next 成長班?
- Who completed 成長班 but has not joined 門徒營?
- Where is person X in the discipleship path?
- How many completed 門徒班?
- Which group members have not attended 成長營?
- Who in this session still lacks completion?
- Who is eligible for 領袖班?
- What needs pastor attention today?
- Which staff tasks are overdue?
- Who has been stalled > N days?

## 18. Automation rules

Prefer configurable `automation_rules` rather than hard-coded business workflows.

Conceptual fields:
- id
- module
- trigger_event
- conditions
- action_type
- assignee_strategy
- delay
- notification_channel
- is_active
- timestamps

Actions may include:
- CREATE_TASK
- SEND_NOTIFICATION
- SCHEDULE_NOTIFICATION
- ASSIGN_WORKER
- ESCALATE
- CREATE_FOLLOWUP

## 19. Audit and permissions

Reuse current RBAC and audit system where available.

Conceptual permissions:
- Pastor/Admin: full
- Training Leader: course/session/student/attendance/completion
- Group Leader: view own group progress; no completion edits unless authorized
- Member: future self-view only

Audit important actions:
- enrollment add/remove
- status change
- completion/revoke completion
- prerequisite override
- bulk completion
- reassignment/escalation where relevant

## 20. Funnel / pastoral analytics

Prepare queries for:
新朋友 → 成長營 → 成長班 → 門徒營 → 門徒班 → 精兵營 → 領袖班

Useful metrics:
- current counts
- completion
- next-stage transition
- average time between stages
- stalled count

These are pastoral follow-up indicators, not commercial scoring.

## 21. Implementation order

### Phase 1 — Discovery
Inspect repo/schema and produce architecture/impact/risks/plan. No large implementation yet.

### Phase 2 — Training core
courses, prerequisites, sessions, enrollments, eligibility, legacy history.

### Phase 3 — Training UI
dashboard, course/session/student management, person training history.

### Phase 4 — Staff collaboration
tasks, assignment, deadlines, follow-up outcomes, team ownership.

### Phase 5 — Automation
events, rules, scheduler, condition re-check, dedupe, escalation.

### Phase 6 — Visitor shared automation
visitor.created → pastor/pastor spouse → care task → reminder lifecycle.

### Phase 7 — Pastor Assistant-ready query layer
safe reusable queries/services.

## 22. Acceptance principles

- Existing people/member data is reused, never duplicated.
- Six-stage prerequisites work and are data-driven.
- Only completed unlocks the next stage.
- Historical completions count.
- Repeating a course does not erase prior qualification.
- Server validates eligibility.
- Overrides are explicit/audited.
- Notifications stop when their condition is no longer true.
- Tasks/reminders/escalations are shared infrastructure.
- Visitor and training workflows use the same automation engine.
- Pastor sees exceptions; staff see actionable work.
- Existing production behavior must not regress.
- Mobile/responsive UI follows current MANAGEMENT conventions.

## 23. Codex instruction for the next run

Start with Phase 1 only.

Inspect the current repository and produce:
1. CURRENT ARCHITECTURE
2. EXISTING TABLES/SERVICES/COMPONENTS TO REUSE
3. PROPOSED SCHEMA DELTA
4. MIGRATION/RLS/RBAC IMPACT
5. AUTOMATION/TASK/NOTIFICATION INTEGRATION PLAN
6. RISKS AND BACKWARD-COMPATIBILITY CONCERNS
7. PHASED IMPLEMENTATION PLAN
8. TEST PLAN

Do not perform a broad rewrite. Do not alter production data. Do not expose secrets. Prefer small, reviewable changes after discovery is approved.
