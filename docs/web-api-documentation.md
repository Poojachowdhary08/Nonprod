# Web API Documentation

## Scope

This document is a frontend-derived API inventory for the web application.

- Web app source reviewed: `src/`
- Primary shared web base URL: `https://test.datso.io`
- Central config file: `src/config.js`
- This is based on actual `fetch` / `axios` usage in the current web code

## Strict Audit Note

This version was cross-checked against:

- all `fetch(...)` calls under `src/`
- all `axios.get/post/put/delete/patch/create(...)` calls under `src/`
- routes built from `API_BASE`, `baseUrl`, `baseURL`, and direct `https://test.datso.io/...` usage

This document covers backend HTTP APIs referenced by the web code.

## What Is Excluded

- external non-backend services like `https://ifsc.razorpay.com/...`
- browser/local file/blob/object URL fetches
- commented-out endpoints
- pure websocket URLs, except where noted separately

## Shared Base URL

- `src/config.js` exports `API_BASE = "https://test.datso.io"`
- some older components still hardcode `https://test.datso.io` directly
- a few files support `REACT_APP_API_BASE`, but current default is still `https://test.datso.io`

## Realtime Note

The web app also uses at least one realtime backend socket:

- `ws://localhost:8080/ws/chat/:propertyId?...`
  - used in `src/components/PropertyLiveChatUpdates.js`

## Endpoint Inventory

### 1. Auth, Roles, Alerts, and Basic Admin

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `GET` | `/roles?email=...` | Role resolution / role-based entry | `src/App.js`, `src/components/Bills.js`, `src/components/ReportsTilesPage.js`, `src/components/LoginPage.js` |
| `POST` | `/log` | Login/system activity logging | `src/components/LoginPage.js` |
| `GET` | `/alerts` | Notification / alert feed | `src/components/AppBarWithSearch.js`, `src/components/NotificationsPage.js` |

### 2. Projects, Properties, Segments, Schedules, and Drawings

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `GET` | `/projects` | Loads project list | `src/components/ProjectsList.js`, `src/components/LaborOnboardingForm.js` |
| `GET` | `/projects/:projectId/segments` | Loads project segments | `src/components/ProjectsList.js` |
| `POST` | `/projects/:projectId/segments` | Creates project segment | `src/components/ProjectsList.js` |
| `POST` | `/projects/:projectId/segments/upload` | Uploads project segments file | `src/components/ProjectsList.js` |
| `GET` | `/projects_m` | Loads project list used across most web flows | many components |
| `GET` | `/projects_m/:projectId` | Loads one project | `src/components/ProjectDetails.js` |
| `PUT` | `/projects_m/:projectId` | Updates one project | `src/components/ProjectDetails.js` |
| `GET` | `/projects_m/:projectId/properties` | Loads project properties | many components |
| `POST` | `/properties/upload` | Uploads properties under project flow | `src/components/ProjectDetails.js` |
| `POST` | `/upload-properties/` | Bulk property upload | `src/components/ViewProperties.js` |
| `POST` | `/upload-properties` | Bulk property upload variant | `src/components/UploadProperties.js` |
| `GET` | `/properties/:propertyId` | Loads property details | multiple property screens |
| `PUT` | `/properties/:propertyId` | Updates property details | `src/components/PropertyDetailsDialog.js` |
| `PATCH` | `/properties/:propertyId/status` | Updates property status | `src/components/PropertyDetailsDialog.js` |
| `PATCH` | `/properties/:propertyId/soft-delete` | Soft deletes property | `src/components/PropertyDetailsDialog.js` |
| `GET` | `/properties/:propertyId/complete?include_floors=...&include_history=...` | Loads full property detail bundle | `src/components/PropertyDetailsDialog.js` |
| `GET` | `/properties/:propertyId/schedule` | Loads property schedule | many workflow/inventory/task components |
| `DELETE` | `/properties/:propertyId/schedule` | Deletes property schedule | `src/components/PropertyDetailsDialog.js` |
| `POST` | `/create-schedule-up` | Uploads/creates schedule | `src/components/ScheduleCreationDialog.js`, `src/components/PropertyPhaseInventoryTab.js` |
| `GET` | `/schedule_update/:scheduleId` | Loads schedule/task update data | many task components |
| `PUT` | `/update-schedule/:scheduleId` | Updates schedule node | many workflow/task components |
| `GET` | `/get-task-id/:scheduleId` | Resolves task id | many workflow/task components |
| `POST` | `/add-schedule-node` | Adds workflow node | `src/components/WorkflowDiagram.js`, `src/components/CustomNodeWithAddButton.js` |
| `DELETE` | `/delete-schedule/:scheduleId` | Deletes workflow node | `src/components/CustomNodeWithAddButton.js` |
| `POST` | `/merge-schedule-with-reschedule` | Merge/reschedule workflow operation | `src/components/WorkflowDiagram.js` |
| `POST` | `/update-position/:nodeId` | Saves workflow node position | `src/components/WorkflowDiagram.js` |
| `PUT` | `/update-dependencies/:nodeId` | Updates workflow dependencies | `src/components/WorkflowDiagram.js` |
| `POST` | `/recalculate-schedule/:nodeId` | Recalculates workflow after dependency change | `src/components/WorkflowDiagram.js` |
| `GET` | `/download-schedule/:propertyId` | Downloads property schedule | `src/components/WorkflowDiagram.js` |
| `POST` | `/hold-schedule` | Holds schedule node | `src/components/WorkflowDiagram.js`, `src/components/CustomNodeWithAddButton.js` |
| `POST` | `/resume-schedule` | Resumes schedule node | `src/components/WorkflowDiagram.js`, `src/components/CustomNodeWithAddButton.js` |
| `GET` | `/holds/:propertyId` | Loads hold history | `src/components/WorkflowDiagram.js`, `src/components/EditHoldsDialog.js` |
| `POST` | `/close-hold` | Closes hold record | `src/components/EditHoldsDialog.js` |
| `POST` | `/schedule/:scheduleId/notes` | Creates schedule note | `src/components/WorkflowDiagram.js` |
| `PUT` | `/notes/:scheduleId` | Updates note text | `src/components/CustomNodeWithAddButton.js` |
| `GET` | `/schedule/:scheduleId/notes_get` | Loads schedule notes | `src/components/WorkflowDiagram.js` |
| `GET` | `/property-drawings/:propertyId` | Loads property drawings | `src/components/PropertyDrawingDialog.js` |
| `POST` | `/upload-property-drawing` | Uploads drawing | `src/components/PropertyDrawingDialog.js` |
| `GET` | `/property-inventory/:propertyName/project/:projectName` | Loads property inventory detail | `src/components/PropertyDetailsDialog.js` |

### 3. Property Floors and Add-ons

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `POST` | `/property/:propertyId/floors` | Creates floor | `src/services/propertyFloorsService.js` |
| `GET` | `/property/:propertyId/floors` | Loads all floors for property | `src/services/propertyFloorsService.js` |
| `GET` | `/property/floors/:floorId` | Loads floor by id | `src/services/propertyFloorsService.js` |
| `GET` | `/property/:propertyId/floors/:floorId` | Loads one floor in property scope | `src/services/propertyFloorsService.js` |
| `PUT` | `/property/floors/:floorId` | Updates floor | `src/services/propertyFloorsService.js` |
| `DELETE` | `/property/floors/:floorId` | Deletes floor | `src/services/propertyFloorsService.js` |
| `POST` | `/property/floors/:floorId/add-ons/customer` | Creates customer add-on | `src/services/propertyFloorsService.js` |
| `POST` | `/property/floors/:floorId/add-ons/avenue` | Creates avenue add-on | `src/services/propertyFloorsService.js` |
| `GET` | `/property/floors/:floorId/adjustments` | Loads floor adjustments | `src/services/propertyFloorsService.js` |
| `GET` | `/property/:propertyId/floors/summary` | Loads floors summary | `src/services/propertyFloorsService.js` |
| `GET` | `/property/:propertyId/floors-and-areas` | Loads floor/area aggregate data | `src/components/PropertyPhaseInventoryTab.js` |

### 4. Employees, Clients, Contractors, Labours, and Manpower

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `GET` | `/employees` | Loads employees | many components |
| `POST` | `/employees-a` | Creates employee | `src/components/EmployeeForm.js` |
| `PUT` | `/employees-a/:employeeId` | Updates employee | `src/components/EmployeeForm.js` |
| `PUT` | `/employee/:employeeCode` | Updates employee details | `src/components/Employee_Details.js` |
| `POST` | `/employee/:employeeCode/assign` | Assigns project/property to employee | `src/components/Employee_Details.js` |
| `POST` | `/employee/:employeeCode/unassign` | Unassigns employee | `src/components/Employee_Details.js` |
| `GET` | `/employee-project/:employeeCode` | Loads projects assigned to employee | `src/components/Employee_Details.js` |
| `GET` | `/employee-properties/:projectId/:employeeCode` | Loads employee properties under project | `src/components/Employee_Details.js` |
| `GET` | `/clients` | Loads clients | `src/components/ClientManagement.js`, `src/components/ClientView.js` |
| `POST` | `/clients` | Creates client | `src/components/AddClientDialog.js` |
| `GET` | `/clients/:clientId/properties` | Loads client properties | `src/components/ClientDetailsDialog.js` |
| `PUT` | `/clients/:clientId` | Updates client | `src/components/ClientDetailsDialog.js` |
| `POST` | `/clients/:clientId/assign-properties` | Assigns properties to client | `src/components/ClientDetailsDialog.js` |
| `POST` | `/clients/approve-assignment?client_id=...&property_id=...` | Approves client-property assignment | `src/components/ClientDetailsDialog.js` |
| `GET` | `/properties-and-projects` | Loads property/project mapping | `src/components/ClientDetailsDialog.js` |
| `GET` | `/contractors` | Loads contractors | `src/components/Backup.js`, `src/components/LaborOnboardingForm.js` |
| `POST` | `/contractors` | Creates contractor | `src/components/Backup.js`, `src/components/ContractorOnboarding.js`, `src/components/ContractorOnboardingForm.js` |
| `GET` | `/contractors/:contractorId` | Loads contractor detail | `src/components/Backup.js`, `src/components/ContractorOnboarding.js`, `src/components/ContractorOnboardingForm.js` |
| `PUT` | `/contractors/:contractorId` | Updates contractor | `src/components/ContractorOnboarding.js`, `src/components/ContractorOnboardingForm.js` |
| `GET` | `/contractors_l/:id` | Loads contractor detail variant | `src/components/ManPowerDetail.js`, `src/components/ManpowerDetails.js` |
| `GET` | `/labors` | Loads labours | `src/components/LaborOnboarding.js`, `src/components/LaborOnboardingForm.js` |
| `POST` | `/labors` | Creates labour | `src/components/LaborOnboarding.js`, `src/components/LaborOnboardingForm.js` |
| `GET` | `/labors/:laborId` | Loads labour detail | `src/components/LaborOnboarding.js`, `src/components/LaborOnboardingForm.js`, `src/components/ManPowerDetail.js`, `src/components/ManpowerDetails.js` |
| `PUT` | `/labors/:laborId` | Updates labour | `src/components/LaborOnboarding.js`, `src/components/LaborOnboardingForm.js` |
| `GET` | `/work-types` | Loads work types | several onboarding/manpower components |
| `GET` | `/labors-contractors` | Loads combined labour/contractor list | `src/components/AssignWorker.js`, `src/components/assign_worker.js`, `src/components/ManPower-sp.js`, `src/components/ManPower.js` |
| `POST` | `/manpower/assignments` | Creates manpower assignment | `src/components/AssignWorker.js`, `src/components/assign_worker.js`, `src/components/ManPower-sp.js` |
| `GET` | `/properties-employee/:propertyId` | Loads employees assigned to property | `src/components/PropertyEmployeesTab.js` |
| `GET` | `/properties-labor/:propertyId` | Loads labours assigned to property | `src/components/PropertyEmployeesTab.js` |
| `POST` | `/properties-employee/bulk` | Bulk-assign employees to property | `src/components/PropertyEmployeesTab.js` |
| `GET` | `/property/:propertyId/assigned-workers` | Loads assigned workers | `src/components/labour_expense.js`, `src/components/LabourExpenses.js` |

### 5. Inventory, Master Items, Warehouses, Stock Movement, and Requests

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `GET` | `/all-inventory` | Loads inventory list | many inventory screens |
| `GET` | `/inventory/:itemName` | Loads inventory by item name | `src/components/OpenItemDialog.js`, `src/components/ItemDetails.js` |
| `GET` | `/inventory/?parsed_item_name=...&parsed_location=...&parsed_warehouse=...` | Item/location/warehouse lookup | `src/components/StockAdjustment.js`, `src/components/ItemDetails.js` |
| `GET` | `/single/inventory/:itemName` | Loads single inventory detail | `src/components/InventoryRequestDialog.js` |
| `GET` | `/request-item/:itemName` | Loads requestable item details | `src/components/InventoryRequestDialog.js`, `src/components/RequestChatDialog.js` |
| `GET` | `/inventory/property/:propertyId` | Loads property inventory | `src/components/InventoryPage.js`, `src/components/PropertyPhaseInventoryTab.js` |
| `POST` | `/inventory/property/upload` | Uploads property inventory | `src/components/InventoryPage.js` |
| `PUT` | `/inventory/property/batch-update` | Batch-updates property inventory | `src/components/InventoryPage.js` |
| `GET` | `/inventory-property/:propertyId/issued-items` | Loads issued inventory items | `src/components/InventoryPage.js` |
| `GET` | `/inventory/location-price-summary` | Loads location price summary | `src/components/LocationPriceSummaryDialog.js` |
| `GET` | `/get-stock-summary/:itemName` | Loads stock summary for item | `src/components/OpenItemDialog.js` |
| `GET` | `/get-all-item-types` | Loads item types | `src/components/MasterItems.js`, `src/components/ItemTypeDropDown.js` |
| `GET` | `/get-all-uom` | Loads UOM list | `src/components/BasicUOM.js`, `src/components/AddMaterialsMissingPhasesModal.js` |
| `POST` | `/create-uom` | Creates UOM | `src/components/BasicUOM.js` |
| `PUT` | `/update-uom/:uomId` | Updates UOM | `src/components/BasicUOM.js` |
| `PUT` | `/update-uom-status/:uomId` | Updates UOM active status | `src/components/BasicUOM.js` |
| `GET` | `/get-all-masteritems-new-non-paginated` | Loads master item list | many master-item/inventory screens |
| `GET` | `/get-all-masteritems-new` | Loads paginated master items | various screens |
| `GET` | `/get-all-masteritems/:itemType` | Loads master items filtered by type | `src/components/MasterItems.js` |
| `POST` | `/create-master-item` | Creates master item | many item creation screens |
| `GET` | `/get-item-history/:itemId` | Loads item history | `src/components/MasterItemDetails.js` |
| `GET` | `/batch-issues-by-item` | Loads batch issues by item | `src/components/MasterItemDetails.js`, `src/components/InventoryPage.js` |
| `PUT` | `/update-item/:itemId` | Updates master item | `src/components/MasterItemDetails.js` |
| `DELETE` | `/hard-delete-master-item/:itemId` | Hard-deletes master item | `src/components/MasterItemDetails.js` |
| `GET` | `/get-item-with-uom/:id` | Loads item with UOM | stock transfer dialogs |
| `PATCH` | `/master-item/rename-and-migrate/:id` | Renames/migrates master item | `src/components/BulkStockTransferDialog.js` |
| `PATCH` | `/transfer-stock` | Transfers stock | stock transfer dialogs |
| `PATCH` | `/add-stock/:itemName` | Adds stock | `src/components/StockAdjustment.js` |
| `PATCH` | `/remove-stock/:itemName` | Removes stock | `src/components/StockAdjustment.js` |
| `GET` | `/projects_ids` | Loads compact project ids list | `src/components/CreateInventoryModal.js`, `src/components/StockAdjustment.js` |
| `POST` | `/update-inventory-up` | Updates inventory from modal flow | `src/components/CreateInventoryModal.js` |
| `GET` | `/inventory-requests` | Loads inventory requests | `src/components/InventoryManagement.js` |
| `GET` | `/inventory-updates/:requestId` | Loads inventory updates for request | `src/components/InventoryManagement.js` |
| `POST` | `/inventory-updates` | Creates inventory update | `src/components/InventoryManagement.js` |
| `PATCH` | `/update-request/:requestId` | Updates inventory request | `src/components/InventoryManagement.js` |
| `DELETE` | `/delete-request/:requestId` | Deletes inventory request | `src/components/InventoryManagement.js` |
| `GET` | `/materials/:taskId` | Loads task materials | several inventory/task components |
| `GET` | `/all-requests` | Loads inventory request list | many request screens |
| `GET` | `/all-requests/stats` | Loads request stats | `src/components/RequestedInventorySection.js` |
| `GET` | `/request/:requestId` | Loads one request with children/details | `src/components/RequestedInventorySection.js` |
| `GET` | `/inventory-requests/:requestId/remarks` | Loads request remarks | several request screens |
| `POST` | `/inventory-requests/:requestId/add-remark` | Adds request remark | several request screens |
| `POST` | `/issue-stock-up` | Issues stock | `src/components/InventoryRequestDialog.js` |
| `POST` | `/raise-stock` | Raises stock | `src/components/InventoryRequestDialog.js` |
| `POST` | `/reject-stock` | Rejects stock | `src/components/InventoryRequestDialog.js` |
| `POST` | `/request-stock` | Requests stock | `src/components/InventoryRequestDialog.js` |
| `POST` | `/revert-stock` | Reverts stock | `src/components/InventoryRequestDialog.js` |
| `POST` | `/close-request-with-remaining-items/` | Closes request with remaining items | `src/components/InventoryRequestDialog.js` |
| `POST` | `/send-whatsapp-update/` | Sends inventory-related WhatsApp update | `src/components/InventoryRequestDialog.js` |
| `GET` | `/issue-stock-logs` | Loads stock issue logs | `src/components/IssueLogs.js` |
| `GET` | `/raised-inventory-items` | Loads raised inventory items | `src/components/RaisedInventoryItems.js` |

### 6. Tickets, Property Chat, Ticket Chat, and Workflow Collaboration

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `GET` | `/tickets/all` | Loads ticket lists | several ticket screens |
| `GET` | `/tickets/property/:propertyId` | Loads property ticket list | several schedule/chat screens |
| `GET` | `/tickets/:issueId` | Loads ticket details | ticket detail dialogs |
| `PUT` | `/tickets/:issueId/assignees` | Updates ticket assignees | `src/components/TicketDetailsDialog.js` |
| `GET` | `/ticket-chat/list/:issueId` | Loads ticket chat | ticket detail dialogs |
| `POST` | `/ticket-chat/send` | Sends ticket chat message | ticket detail dialogs |
| `GET` | `/property-chat/:propertyId` | Loads property chat | live chat components |
| `GET` | `/property-chat/search` | Searches property chat | live chat components |
| `POST` | `/property-chat/send` | Sends property chat message | many workflow/chat components |
| `POST` | `/property-chat/:messageId/react` | Reacts to property chat message | `src/components/PropertyLiveChatUpdates.js` |
| `POST` | `/property-chat/:messageId/star` | Stars property chat message | `src/components/PropertyLiveChatUpdates.js` |

### 7. Documents, Uploads, and Property Assets

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `GET` | `/file/property/:propertyId` | Loads property task/doc files | `src/components/PropertyDocumentsTab.js` |
| `GET` | `/properties-documents/:propertyId` | Loads property documents | `src/components/PropertyDocumentsTab.js` |
| `POST` | `/properties-documents` | Uploads property documents | `src/components/PropertyDocumentsTab.js` |
| `POST` | `/upload-invoice` | Uploads invoice | `src/components/UploadInvoice.js` |
| `POST` | `/upload-tax-invoice` | Uploads tax invoice | `src/components/UploadTaxInvoice.js` |
| `GET` | `/check-invoice/:invoiceNo` | Checks invoice duplication/validity | invoice upload screens |

### 8. Invoices, Payments, Vendors, Prices, and Estimates

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `GET` | `/get-all-invoices` | Loads invoices | bills/manage inventory/proforma screens |
| `GET` | `/get-invoice/:invoiceId` | Loads single invoice | bills/manage inventory/proforma screens |
| `GET` | `/latest-ready-for-review-invoices` | Dashboard invoice metric | `src/components/DashBoardPage.js` |
| `GET` | `/invoice-status-count` | Dashboard invoice metric | `src/components/DashBoardPage.js` |
| `GET` | `/get-transactions/:entityType/:entityId` | Loads payment transactions | `src/components/ReadyForPaymentForm.js` |
| `POST` | `/update-payment-status` | Updates payment status | `src/components/ReadyForPaymentForm.js` |
| `POST` | `/payments/create` | Creates payment | `src/components/PaySlipDialog.js` |
| `POST` | `/payments/update-status` | Updates payment mode/status | `src/components/InvoiceViewDialog.js` |
| `GET` | `/payments/list` | Loads payments list | `src/components/PaymentWorkerTab.js` |
| `GET` | `/latest-prices` | Loads recent prices | `src/components/ItemPrices.js` |
| `GET` | `/get-all-vendors` | Loads vendors | vendor dropdown/detail screens |
| `GET` | `/get-vendor?vendor_id=...` | Loads one vendor | `src/components/VendorDetailsComponent.js` |
| `GET` | `/vendor/:prefix` | Vendor lookup/search | `src/components/ReadyForReviewForm.js` |
| `POST` | `/create-vendor` | Creates vendor | vendor forms |
| `PUT` | `/update-vendor/:vendorId` | Updates vendor | vendor forms |
| `GET` | `/est-projects` | Loads estimate projects | `src/components/Estimate.js` |
| `GET` | `/est-properties/:projectId` | Loads estimate properties | `src/components/Estimate.js` |
| `POST` | `/estimates/save` | Creates estimate | `src/components/Estimate.js` |
| `POST` | `/estimates/update/:estimateId` | Updates estimate | `src/components/Estimate.js` |
| `GET` | `/estimates/list` | Loads estimate list | `src/components/estimateList.js` |
| `GET` | `/estimates/:estimateId` | Loads estimate detail | `src/components/estimateList.js` |
| `POST` | `/add-item-price-history-bulk` | Adds bulk item price history | `src/components/ReadyForReviewForm.js` |
| `POST` | `/update-invoice-status` | Updates invoice status | `src/components/ReadyForReviewForm.js` |
| `POST` | `/save-invoice-changes` | Saves invoice edits | `src/components/ReadyForReviewForm.js` |
| `POST` | `/delete-invoice-item` | Deletes invoice item | `src/components/ReadyForReviewForm.js` |

### 9. Dashboard, Reports, Summaries, Holidays, and Analytics

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `GET` | `/dashboard/total-projects` | Dashboard metric | `src/components/DashBoardPage.js` |
| `GET` | `/dashboard/total-properties` | Dashboard metric | `src/components/DashBoardPage.js` |
| `GET` | `/dashboard/total-vendors` | Dashboard metric | `src/components/DashBoardPage.js` |
| `GET` | `/dashboard/cost-spend` | Dashboard metric | `src/components/DashBoardPage.js` |
| `GET` | `/dashboard/warehouse-inventory-value` | Dashboard metric | `src/components/DashBoardPage.js` |
| `GET` | `/dashboard/inventory` | Dashboard metric | `src/components/DashBoardPage.js` |
| `GET` | `/dashboard/inventory/low-stock-items` | Dashboard metric | `src/components/DashBoardPage.js` |
| `GET` | `/dashboard/projects-status` | Dashboard metric | `src/components/DashBoardPage.js` |
| `GET` | `/daily-work/property-wise-summary?...` | Daily work summary | `src/components/Work-Summary.js` |
| `GET` | `/d_summary/task-updates/:date` | Daily task updates summary | `src/components/DailyUpdates.js`, `src/components/Calendar.js` |
| `GET` | `/d_summary/phase-alerts/:date` | Daily phase alerts | `src/components/DailyUpdates.js` |
| `GET` | `/holidays` | Loads holidays | calendar components |
| `POST` | `/holidays` | Creates holiday | calendar components |
| `PUT` | `/holidays/:holidayId` | Updates holiday | calendar components |
| `DELETE` | `/holidays/:holidayId` | Deletes holiday | calendar components |
| `POST` | `/holidays/upload` | Bulk uploads holidays | calendar components |
| `GET` | `/low-stock` | Loads low-stock view | `src/components/LowStockView.js` |

### 10. Forecasting, Advanced Inventory Planning, and Phase Planning

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `GET` | `/inventory/forecast/templates` | Loads forecast templates | `src/components/PropertyPhaseInventoryTab.js` |
| `POST` | `/inventory/forecast/templates/upload-excel` | Uploads forecast template Excel | `src/components/PropertyPhaseInventoryTab.js` |
| `GET` | `/inventory/forecast/templates/sample-excel` | Template sample download | `src/components/PropertyPhaseInventoryTab.js` |
| `POST` | `/inventory/forecast/templates/copy` | Copies forecast template | `src/components/PropertyPhaseInventoryTab.js` |
| `DELETE` | `/inventory/forecast/templates/:templateId` | Deletes template | `src/components/PropertyPhaseInventoryTab.js` |
| `POST` | `/inventory/forecast/templates/:templateId/add-phase-items` | Adds phase items into template | `src/components/PropertyPhaseInventoryTab.js` |
| `GET` | `/inventory/forecast/forecast/planned-pricing` | Loads planned pricing | `src/components/PropertyPhaseInventoryTab.js` |
| `POST` | `/inventory/forecast/forecast/draft-all-phases` | Drafts forecast for all phases | `src/components/PropertyPhaseInventoryTab.js` |
| `POST` | `/inventory/forecast/forecast/plan-all-phases` | Plans forecast for all phases | `src/components/PropertyPhaseInventoryTab.js` |
| `POST` | `/inventory/forecast/forecast/save-ad-hoc-items` | Saves ad-hoc forecast items | `src/components/PropertyPhaseInventoryTab.js` |
| `GET` | `/inventory/forecast/forecast/results?...` | Loads forecast results | `src/components/PropertyPhaseInventoryTab.js` |
| `DELETE` | `/inventory/forecast/forecast/results?property_id=...&forecast_status=...` | Deletes forecast results | `src/components/PropertyPhaseInventoryTab.js` |

### 11. Task Updates and AI/Assistant Utilities

| Method | Endpoint | Purpose | Used In |
| --- | --- | --- | --- |
| `GET` | `/task-updates/:taskId` | Loads task updates by task id | `src/components/TaskUpdates.js` |
| `GET` | `/task_updates/:taskId` | Loads task updates legacy path | `src/components/TaskUpdate.js` |
| `POST` | `/task-updates` | Creates task update | many workflow/task components |
| `GET` | `/quickqueries?...` | Quick AI/support queries | `src/components/ChatBoxAi.js` |
| `GET` | `/askquery?...` | AI/support query execution | `src/components/ChatBoxAi.js` |

## Explicitly Excluded From This Doc

These appear in `src/` but are not backend web APIs:

- `https://ifsc.razorpay.com/...`
- local file/object/blob fetches
- websocket transport details beyond the one note above

## Notes

- The web app contains both newer centralized API usage and many older direct hardcoded calls.
- Several endpoints appear in multiple components with the same business meaning.
- Some screens include malformed or legacy string literals, but they were still included where clearly intended as backend endpoints.

## Suggested Next Step

Now that mobile and web are both documented separately, the best next step is to create a merged API matrix:

1. shared mobile + web APIs
2. mobile-only APIs
3. web-only APIs
4. APIs that should probably be consolidated or renamed
