# Mobile API Documentation

## Scope

This document is a frontend-derived API inventory for the mobile application.

- Mobile app source reviewed: `app/`
- Supporting mobile startup utilities also checked: `utils/apiBase.ts`, `utils/registerPrelogin.ts`, `hooks/useSessionRedirect.ts`
- Current mobile API base URL: `https://test.datso.io`
- This is based on actual `fetch` / `axios` usage in the mobile code, not on Swagger guesses

## What This Covers

- Confirmed mobile API routes currently used by the app
- Main HTTP method used from the mobile app
- Why the endpoint is used
- Main mobile screens using it
- Mobile helper / support routes used by offline sync, telemetry, push registration, and app-version control

## What This Does Not Cover Yet

- Web-only routes under `src/`
- Backend-only routes that are not called by the mobile app
- External non-backend services such as OpenStreetMap / Google Maps / local file URIs
- Commented-out / dead code paths that are not currently executed

## Strict Audit Note

This version was cross-checked against:

- all `fetch(...)` calls under `app/`, `utils/`, and `hooks/`
- all `axios.get/post/put/delete/patch(...)` calls under `app/`, `utils/`, and `hooks/`
- dynamic routes built from `APP_API_BASE_URL`, `API_BASE_URL`, `API_BASE`, `BASE_URL`, and `axios.defaults.baseURL`

So this is the strict mobile API inventory for the current codebase usage, excluding only:

- non-backend external URLs
- local file/blob/object-URL fetches
- commented-out endpoints not currently in use

## Shared Base URL

- `utils/apiBase.ts` hardcodes the non-prod mobile API base to `https://test.datso.io`
- `app/_layout.tsx` also sets `axios.defaults.baseURL = API_BASE_URL`

## Endpoint Inventory

### 1. Auth, Session, and User Resolution

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `POST` | `/prelogin/register-device` | Registers device/token before OTP or password login | `utils/registerPrelogin.ts`, `app/LoginPage.tsx` |
| `POST` | `/send-otp/` | Sends OTP to phone number | `app/LoginPage.tsx` |
| `POST` | `/verify-otp/` | Verifies OTP login | `app/LoginPage.tsx` |
| `POST` | `/login-password` | Password-based login | `app/LoginPage.tsx` |
| `POST` | `/forgot-password` | Starts password reset flow | `app/LoginPage.tsx` |
| `POST` | `/verify-session/` | Validates saved login session | `app/CustomerHomeScreen.tsx`, `hooks/useSessionRedirect.ts` |
| `POST` | `/logout/` | Logs out current session | `app/index.tsx`, `app/CustomerHomeScreen.tsx` |
| `GET` | `/employees/:phoneOrEmployeeCode` | Resolves employee details and employee session type | `app/HomeScreen.tsx`, `app/PropertyInventory.tsx`, `hooks/useSessionRedirect.ts` |
| `GET` | `/employees/:employeeCode/home-summary` | Loads employee home dashboard summary | `app/HomeScreen.tsx`, `app/PropertyInventory.tsx` |
| `GET` | `/clients-phone/:phoneNumber` | Resolves client account from phone | `app/CustomerHomeScreen.tsx`, `hooks/useSessionRedirect.ts` |
| `GET` | `/clients/:clientId/properties` | Loads client-visible properties | `app/CustomerHomeScreen.tsx` |

JWT note for CRM sales APIs:

- Sales-role CRM calls now use bearer-token auth through `authenticatedFetch(...)`.
- The old mobile-only `employee_code` / `role` request headers are no longer the auth contract for these routes.

### 2. Projects, Properties, Workers, and Property Files

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `GET` | `/employee-project/:employeeCode` | Loads projects assigned to logged-in employee | `app/ProjectsScreen.tsx`, `app/ManPower.tsx`, `app/MultipleRequestMasterItem.tsx` |
| `GET` | `/employee-properties/:employeeCode` | Loads employee property list | `app/PropertiesScreen.tsx`, `app/PropertiesChatList.tsx` |
| `GET` | `/employee-properties/:projectId/:employeeCode` | Loads employee properties for a selected project | `app/ProjectsScreen.tsx`, `app/ManPower.tsx`, `app/MultipleRequestMasterItem.tsx` |
| `GET` | `/projects_m` | Loads mobile project list | `app/CustomerProjects.tsx`, `app/MasterItems.tsx`, `app/InventoryItemDetails.tsx`, `app/RaiseIssue.tsx`, `app/PropertiesMasterItems.tsx` |
| `GET` | `/projects_m/:projectId/properties` | Loads properties under a project | `app/CustomerProperties.tsx`, `app/MasterItems.tsx`, `app/InventoryItemDetails.tsx`, `app/RaiseIssue.tsx`, `app/PropertiesMasterItems.tsx`, `app/MasterItemDetails.tsx` |
| `GET` | `/properties/:propertyId` | Loads property detail payload | `app/PropertiesListScreen.tsx` |
| `GET` | `/property/:propertyId` | Fallback property detail payload | `app/PropertiesListScreen.tsx` |
| `GET` | `/properties-and-projects` | Loads stock-manager property/project filter data | `app/StockManager.tsx` |
| `GET` | `/properties/:propertyId/requests` | Loads inventory requests scoped to one property | `app/PropertyInventory.tsx` |
| `GET` | `/property/:propertyId/workers` | Loads workers assigned to a property | `app/PropertyWorkers.tsx` |
| `GET` | `/property/:propertyId/workers/:workerType/:workerId/entries` | Loads daily entries for one worker inside a property | `app/WorkerEntriesScreen.tsx` |
| `GET` | `/worker/:workerId/summary` | Loads worker summary/analytics | `app/ManPowerListDetails.tsx` |
| `GET` | `/labors-contractors` | Loads master labour/contractor list | `app/ManPowerList.tsx` |
| `GET` | `/file/property/:propertyId` | Loads property documents/files | `app/PropertyHistory.tsx` |

### 3. Schedule, Tasks, Workflow, and Daily Work

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `GET` | `/properties/:propertyId/schedule` | Loads property schedule / phases / workflow nodes | `app/ViewSchedulesForm.tsx`, `app/TaskSchedule.tsx`, `app/TaskWorkflow.tsx`, `app/CustomerTaskWorkflow.tsx`, `app/PropertyRaiseIssue.tsx`, `app/RaiseIssue.tsx`, `app/ManPower.tsx`, `app/LabourDetailsFormScreen.tsx`, `app/PropertiesMultiRequestMasterItem.tsx` |
| `GET` | `/properties/:propertyId/schedule?x_min=...&x_max=...&y_min=...&y_max=...` | Loads bounded workflow view | `app/CustomerTaskWorkflow.tsx` |
| `GET` | `/schedule/:scheduleId/notes_get` | Loads schedule notes | `app/CustomerTaskWorkflow.tsx` |
| `GET` | `/employee-property-tasks/:employeeCode` | Loads employee task list and assigned property count | `app/TaskList.tsx` |
| `GET` | `/schedule_update/:scheduleId` | Loads task details and update timeline | `app/TaskManagementForm.tsx` |
| `GET` | `/get-task-id/:scheduleId` | Resolves task id from schedule id | `app/TaskManagementForm.tsx` |
| `PUT` | `/update-schedule/:scheduleId` | Updates schedule status / dates | `app/TaskManagementForm.tsx` |
| `POST` | `/task-updates` | Creates task progress update | `app/TaskManagementForm.tsx`, `app/TaskList.tsx` |
| `POST` | `/hold-schedule` | Puts a schedule node on hold | `app/TaskWorkflow.tsx`, `app/TaskManagementForm.tsx` |
| `POST` | `/resume-schedule` | Resumes a held schedule node | `app/TaskWorkflow.tsx`, `app/TaskManagementForm.tsx` |
| `GET` | `/holds/:propertyId` | Loads property hold log/history | `app/TaskWorkflow.tsx` |
| `GET` | `/manpower/assigned-contractors?project_id=...&property_id=...` | Loads contractors assigned to project/property | `app/ManPower.tsx`, `app/LabourDetailsFormScreen.tsx` |
| `GET` | `/manpower/assigned-labors?project_id=...&property_id=...` | Loads labours assigned to project/property | `app/ManPower.tsx`, `app/LabourDetailsFormScreen.tsx` |
| `GET` | `/work-types` | Loads daily-work work types | `app/ManPower.tsx`, `app/LabourDetailsFormScreen.tsx` |
| `POST` | `/daily-work` | Submits labour/contractor daily work entry | `app/ManPower.tsx`, `app/LabourDetailsFormScreen.tsx` |

### 4. Inventory, Master Items, Stock Requests, and Stock Actions

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `GET` | `/all-inventory` | Loads stock inventory list | `app/InventoryScreen.tsx`, `app/StockInventoryScreen.tsx` |
| `GET` | `/inventory/?parsed_item_name=...` | Loads inventory details for a parsed item name | `app/InventoryItemDetails.tsx` |
| `GET` | `/lookup/inventory?parsed_item_name=...&parsed_location=...&parsed_warehouse=...` | Looks up item stock by QR / OCR parsed values | `app/ScanImage.tsx`, `app/ScanQRResult.tsx`, `app/InventoryScanResult.tsx` |
| `GET` | `/get-all-masteritems-new` | Loads paginated master items | `app/MasterItems.tsx`, `app/MultipleRequestMasterItem.tsx` |
| `GET` | `/get-all-masteritems-new-non-paginated` | Loads full master item list | `app/PropertiesMasterItems.tsx`, `app/PropertiesMultiRequestMasterItem.tsx` |
| `GET` | `/get-all-item-types` | Loads item type filters | `app/MasterItems.tsx`, `app/PropertiesMasterItems.tsx` |
| `GET` | `/get-item-with-uom/:masterItemId` | Loads one master item with UOM | `app/MultipleRequestMasterItem.tsx` |
| `POST` | `/request-inventory` | Creates inventory request | `app/MasterItems.tsx`, `app/InventoryItemDetails.tsx`, `app/PropertiesMasterItems.tsx`, `app/PropertiesMultiRequestMasterItem.tsx`, `app/MasterItemDetails.tsx`, `app/MultipleRequestMasterItem.tsx` |
| `GET` | `/all-requests` | Loads stock requests master list | `app/RequestedInventory.tsx`, `app/HomeScreen.tsx`, `app/StockManager.tsx` |
| `GET` | `/all-requests/:employeeCode` | Loads stock requests scoped to employee | `app/RequestedInventory.tsx` |
| `GET` | `/all-requests/:employeeCode/delta?since=...` | Polls incremental stock-request changes | `app/RequestedInventory.tsx` |
| `GET` | `/request/:requestId?page=...&limit=...` | Loads child requests under parent request | `app/RequestedInventory.tsx` |
| `GET` | `/request-inventory/:requestId` | Loads full stock request details, lines, transactions, and movement logs | `app/StockRequestDetails.tsx` |
| `GET` | `/inventory-requests/:requestId/remarks` | Loads request remarks | `app/EditDeleteInventory.tsx` |
| `POST` | `/inventory-requests/:requestId/add-remark` | Adds request remark with files | `app/EditDeleteInventory.tsx` |
| `PATCH` | `/update-request/:requestId` | Updates request header fields | `app/EditDeleteInventory.tsx` |
| `DELETE` | `/delete-request/:requestId` | Deletes / withdraws request | `app/EditDeleteInventory.tsx` |
| `POST` | `/issue-stock-up` | Issues stock against a request | `app/InventoryScanResult.tsx` |
| `POST` | `/raise-stock` | Creates raised stock request / remainder request | `app/InventoryScanResult.tsx` |
| `POST` | `/reject-stock` | Rejects stock request | `app/InventoryScanResult.tsx` |
| `POST` | `/return-stock` | Returns previously issued stock | `app/StockRequestDetails.tsx` |

### 5. Tickets, Issues, and Ticket Chat

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `GET` | `/tickets/all` | Loads ticket review list | `app/ReviewEngineer.tsx` |
| `GET` | `/tickets/property/:propertyId` | Loads tickets for a property | `app/PropertyChats.tsx`, `app/PropertyReviewEngineer.tsx` |
| `GET` | `/tickets/property/:propertyId/customer` | Loads customer-visible property tickets | `app/CustomerChats.tsx` |
| `POST` | `/tickets/create` | Creates issue / ticket from Raise Issue flow | `app/RaiseIssue.tsx`, `app/PropertyRaiseIssue.tsx` |
| `GET` | `/issue-types` | Loads issue type options | `app/RaiseIssue.tsx`, `app/PropertyRaiseIssue.tsx` |
| `GET` | `/employees` | Loads employee assignee list | `app/RaiseIssue.tsx`, `app/PropertyRaiseIssue.tsx` |
| `GET` | `/assigned-employees/:propertyId` | Loads property assignee options | `app/RaiseIssue.tsx`, `app/PropertyRaiseIssue.tsx`, `app/PropertyChats.tsx` |
| `GET` | `/tickets/:issueId` | Loads single ticket detail | `app/TicketDetails.tsx` |
| `POST` | `/tickets/:issueId/close` | Closes ticket | `app/TicketDetails.tsx`, `app/PropertyChats.tsx` |
| `POST` | `/tickets/:issueId/reopen` | Reopens ticket | `app/PropertyChats.tsx` |
| `POST` | `/tickets/:issueId/request-close` | Requests close approval | `app/TicketDetails.tsx` |
| `POST` | `/tickets/create-from-message` | Creates ticket from property chat message | `app/PropertyChats.tsx` |
| `POST` | `/tickets/update-title` | Updates linked ticket title | `app/PropertyChats.tsx` |
| `GET` | `/ticket-chat/list/:issueId` | Loads ticket chat thread | `app/TicketDetails.tsx` |
| `POST` | `/ticket-chat/send` | Sends ticket chat message with optional files | `app/TicketDetails.tsx` |

### 6. Property Chat and Customer Chat

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `GET` | `/property-chat/:propertyId` | Loads general property chat | `app/PropertyChats.tsx`, `app/PropertyChatsMessages.tsx` |
| `GET` | `/property-chat/:propertyId/client-view` | Loads client-visible property chat | `app/CustomerChats.tsx` |
| `GET` | `/property-chat/:propertyId/starred` | Loads starred property messages | `app/PropertyChats.tsx`, `app/PropertyChatsMessages.tsx`, `app/CustomerChats.tsx` |
| `GET` | `/property-chat/:propertyId/pinned` | Loads pinned property messages | `app/PropertyChats.tsx`, `app/PropertyChatsMessages.tsx`, `app/CustomerChats.tsx` |
| `GET` | `/property-chat/search` | Searches property chat | `app/PropertyChats.tsx`, `app/PropertyChatsMessages.tsx`, `app/CustomerChats.tsx` |
| `GET` | `/property-chat/search-by-ticket` | Searches messages within linked ticket thread | `app/PropertyChats.tsx` |
| `POST` | `/property-chat/send` | Sends property chat message with files | `app/TaskManagementForm.tsx`, `app/TaskList.tsx`, `app/PropertyChats.tsx`, `app/PropertyChatsMessages.tsx`, `app/CustomerChats.tsx` |
| `POST` | `/property-chat/:messageId/star` | Toggles star flag on a message | `app/PropertyChats.tsx`, `app/PropertyChatsMessages.tsx`, `app/CustomerChats.tsx` |
| `POST` | `/property-chat/:messageId/react` | Adds emoji reaction to a message | `app/PropertyChats.tsx`, `app/PropertyChatsMessages.tsx`, `app/CustomerChats.tsx` |
| `POST` | `/property-chat/link-ticket` | Links existing ticket to a chat message | `app/PropertyChats.tsx` |
| `POST` | `/trigger-notification` | Triggers push/in-app notification after chat action | `app/PropertyChats.tsx`, `app/PropertyChatsMessages.tsx`, `app/CustomerChats.tsx` |
| `GET` | `/customer-ticket-chat/:ticketId` | Loads customer ticket thread linked from chat | `app/PropertyChats.tsx`, `app/CustomerChats.tsx` |

### 7. Mobile Support, Sync, Telemetry, and App Control

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `POST` | `/mobile-events/batch` | Flushes mobile telemetry event batch | `utils/telemetry.ts` |
| `POST` | `/log` | Writes outbox / DLQ audit log to backend | `utils/outbox.ts` |
| `POST` | `/log-version` | Sends installed app version audit info | `hooks/useAppVersionControl.ts` |
| `GET` | `/get-latest-version?platform=...` | Checks latest and minimum supported app version | `hooks/useAppVersionControl.ts` |
| `POST` | `/register-push-token` | Registers Expo push token against employee/device | `hooks/useRegisterPushToken.ts` |

### 8. CRM Sales Leads

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `GET` | `/crm/leads?is_open=...&limit=...&offset=...` | Loads the authenticated sales employee's lead pipeline for dashboard, leads, clients, and home metrics | `app/HomeScreen.tsx`, `app/SalesDashboard.tsx`, `app/SalesLeads.tsx`, `app/SalesClients.tsx` |
| `POST` | `/crm/leads` | Creates a new sales lead from the add-lead flow | `app/AddLead.tsx` |
| `GET` | `/crm/leads/:leadId/detail` | Loads one lead with contacts, notes, activities, reminders, and tasks | `app/LeadDetails.tsx` |
| `GET` | `/crm/masters` | Loads CRM stage/source/job-type masters for lead creation | `app/AddLead.tsx` |
| `POST` | `/crm/leads/:leadId/move-stage` | Moves a lead forward, backward, or to lost with audit details | `app/LeadDetails.tsx` |
| `POST` | `/crm/leads/:leadId/restore` | Restores a lost lead back into the pipeline | `app/LeadDetails.tsx` |

## Important Query Parameters Seen in Mobile

These are worth documenting for the team because the route alone is not enough:

- `/all-requests`
  - `limit`
  - `offset`
  - `parent_only`
  - `status`
  - `search`
  - `property`
- `/all-requests/:employeeCode/delta`
  - `since`
  - `include_remarks`
- `/request/:requestId`
  - `page`
  - `limit`
- `/request-inventory/:requestId`
  - no query params seen in mobile
- `/employee-property-tasks/:employeeCode`
  - `page`
  - `page_size`
  - `search`
- `/property-chat/:propertyId`
  - `limit`
  - `before_message_id`
- `/property-chat/search`
  - `property_id`
  - `query`
- `/property-chat/search-by-ticket`
  - `issue_id`
  - `query`
- `/lookup/inventory`
  - `parsed_item_name`
  - `parsed_location`
  - `parsed_warehouse`
- `/get-latest-version`
  - `platform`

## Reused Endpoints Across Multiple Features

These routes are heavily reused and should probably be explained especially well in your final team-facing version:

- `/projects_m`
- `/projects_m/:projectId/properties`
- `/properties/:propertyId/schedule`
- `/request-inventory`
- `/all-requests`
- `/property-chat/send`
- `/tickets/create`
- `/assigned-employees/:propertyId`

## Explicitly Excluded From This Doc

These appear in the mobile code but are not backend mobile APIs:

- `https://nominatim.openstreetmap.org/...` in `app/PropertyDetailsScreen.tsx`
- Google Maps navigation links opened via `Linking`
- `fetch(file.uri)`, `fetch(blobUrl)`, `fetch(objectUrl)` used only to read local/web-selected files before upload
- `NetInfo.fetch()` and other device/platform APIs

## Audit Outcome

As of this strict pass, the mobile documentation covers the backend endpoints referenced by the current mobile application code under:

- `app/`
- `utils/` where backend sync/logging is used by mobile runtime
- `hooks/` where backend mobile runtime features are used

## Suggested Next Step

The best next move is:

1. Freeze this mobile list as version 1.
2. Review it together once and mark:
   - mobile-only APIs
   - web-only APIs
   - shared mobile + web APIs
3. Then I can create:
   - a matching `web-api-documentation.md`
   - a merged master API matrix
   - a cleaner handoff format for your team with request body fields, query params, auth expectations, and sample payloads

## Notes

- Some routes are hit from more than one screen with slightly different query params.
- A few endpoints serve different user types depending on session state, especially auth/session/chat routes.
- This document intentionally reflects current frontend usage, so it is a very practical starting point for internal documentation.
