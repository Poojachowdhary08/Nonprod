# API Usage Cross-Check

## Scope

This file cross-checks the active backend routes against the current frontend codebases:

- Mobile frontend scanned: `app/`, `utils/`, `hooks/`
- Web frontend scanned: `src/`
- Backend route sources scanned: `backend/main.py` and `backend/api/routes/*.py`
- Base URL cross-check target: `https://test.datso.io`

## Status Tags

- `USED_IN_BOTH`: route is referenced by both mobile and web
- `MOBILE_ONLY`: route is referenced only by mobile
- `WEB_ONLY`: route is referenced only by web
- `UNUSED`: route exists in the active backend but was not found in the current mobile or web frontend code scan

## Summary

- Shared APIs: 31
- Mobile-only APIs: 38
- Web-only APIs: 154
- Currently unused backend APIs: 203

## Important Notes

- This is a code-usage audit, not a Swagger dump.
- Dynamic frontend route building was normalized so paths like `/tickets/${issueId}` and `/projects_m/${projectId}/properties` are matched to backend path params.
- External integrations such as OpenStreetMap, Razorpay IFSC, local file/blob URLs, and device APIs are intentionally excluded.
- Websocket usage is not included in the counts below. Current websocket seen in web: `wss://test.datso.io/ws/chat/:propertyId`.
- A route being tagged `UNUSED` means it was not found in the current frontend code scan. It may still be used by cron jobs, admin tooling, Postman/manual flows, future work, or external systems.
- Supplemental note: `backend/crm/router.py` is mounted by `backend/main.py` and is used by the mobile sales-role flow, but it was not part of the original generated route-source scan.

## Shared APIs

These routes are currently referenced in both mobile and web code.

| Tag | Method | Endpoint | Backend Source | Frontend References |
| --- | --- | --- | --- | --- |
| `USED_IN_BOTH` | `GET` | `/all-requests` | `backend/api/routes/inventory.py` | Mobile: app/RequestedInventory.tsx ; Web: src/components/RequestedInventorySection.js |
| `USED_IN_BOTH` | `GET` | `/clients/{client_id}/properties` | `backend/api/routes/clients.py` | Mobile: app/CustomerHomeScreen.tsx ; Web: src/components/ClientDetailsDialog.js |
| `USED_IN_BOTH` | `GET` | `/employees` | `backend/api/routes/employees.py` | Mobile: app/PropertyRaiseIssue.tsx, app/RaiseIssue.tsx, hooks/useSessionRedirect.ts ; Web: src/components/AssignEmployeeDialog.js, src/components/Employee_Details.js, src/components/Employee_Table.js, src/components/RequestChatDialog.js, src/components/StructuredRemarksView.js, src/components/TicketDetailsDialog.js |
| `USED_IN_BOTH` | `GET` | `/file/property/{property_id}` | `backend/api/routes/properties.py` | Mobile: app/PropertyHistory.tsx ; Web: src/components/PropertyDocumentsTab.js |
| `USED_IN_BOTH` | `GET` | `/get-all-item-types` | `backend/api/routes/master_items.py` | Mobile: app/MasterItems.tsx ; Web: src/components/MasterItems.js |
| `USED_IN_BOTH` | `GET` | `/get-task-id/{schedule_id}` | `backend/api/routes/schedule.py` | Mobile: app/TaskManagementForm.tsx ; Web: src/components/CustomNodeWithAddButton.js, src/components/PhaseDetailsModal.js, src/components/WorkflowDiagram.js |
| `USED_IN_BOTH` | `GET` | `/holds/{propertyid}` | `backend/api/routes/schedule.py` | Mobile: app/TaskWorkflow.tsx ; Web: src/components/EditHoldsDialog.js, src/components/WorkflowDiagram.js |
| `USED_IN_BOTH` | `POST` | `/inventory-requests/{request_id}/add-remark` | `backend/api/routes/inventory.py` | Mobile: app/EditDeleteInventory.tsx ; Web: src/components/InventoryRequestDialog.js, src/components/RequestChatDialog.js, src/components/StructuredRemarksView.js |
| `USED_IN_BOTH` | `GET` | `/inventory-requests/{request_id}/remarks` | `backend/api/routes/inventory.py` | Mobile: app/EditDeleteInventory.tsx ; Web: src/components/InventoryRequestDialog.js, src/components/RequestChatDialog.js |
| `USED_IN_BOTH` | `GET` | `/labors-contractors` | `backend/api/routes/daily_work.py` | Mobile: app/ManPowerList.tsx ; Web: src/components/AssignWorker.js, src/components/ManPower-sp.js, src/components/ManPower.js, src/components/assign_worker.js |
| `USED_IN_BOTH` | `POST` | `/log` | `backend/api/routes/transactions.py` | Mobile: utils/outbox.ts ; Web: src/components/LoginPage.js |
| `USED_IN_BOTH` | `GET` | `/projects_m` | `backend/api/routes/projects.py` | Mobile: app/CustomerProjects.tsx, app/InventoryItemDetails.tsx, app/MasterItems.tsx, app/RaiseIssue.tsx ; Web: src/components/AssignWorker.js, src/components/Employee_Details.js, src/components/ManPower-sp.js, src/components/ProjectOnboarding-sp.js, src/components/ProjectOnboarding.js, src/components/ProjectsTab.js, src/components/PropertyDataEntryPage.js, src/components/assign_worker.js |
| `USED_IN_BOTH` | `GET` | `/projects_m/{project_id}/properties` | `backend/api/routes/projects.py` | Mobile: app/CustomerProperties.tsx, app/InventoryItemDetails.tsx, app/RaiseIssue.tsx ; Web: src/components/AssignWorker.js, src/components/DailyUpdates.js, src/components/Employee_Details.js, src/components/ManPower-sp.js, src/components/ProjectDetails.js, src/components/ProjectProperties.js, src/components/PropertiesTab.js, src/components/PropertyDetailsDialog.js, src/components/ViewProperties.js, src/components/assign_worker.js |
| `USED_IN_BOTH` | `GET` | `/properties/{property_id}/schedule` | `backend/api/routes/properties.py` | Mobile: app/CustomerTaskWorkflow.tsx, app/PropertyRaiseIssue.tsx, app/RaiseIssue.tsx, app/TaskSchedule.tsx, app/TaskWorkflow.tsx, app/ViewSchedulesForm.tsx ; Web: src/components/InventoryModel.js, src/components/PropertyDetailsDialog.js, src/components/PropertyPhaseInventoryTab.js, src/components/TaskManager.js |
| `USED_IN_BOTH` | `GET` | `/property-chat/{property_id}` | `backend/api/routes/property_chat.py` | Mobile: app/PropertyChats.tsx ; Web: src/components/PropertyLiveChatUpdates.js |
| `USED_IN_BOTH` | `POST` | `/property-chat/{message_id}/react` | `backend/api/routes/property_chat.py` | Mobile: app/CustomerChats.tsx, app/PropertyChats.tsx, app/PropertyChatsMessages.tsx ; Web: src/components/PropertyLiveChatUpdates.js |
| `USED_IN_BOTH` | `POST` | `/property-chat/{message_id}/star` | `backend/api/routes/property_chat.py` | Mobile: app/CustomerChats.tsx, app/PropertyChats.tsx, app/PropertyChatsMessages.tsx ; Web: src/components/PropertyLiveChatUpdates.js |
| `USED_IN_BOTH` | `GET` | `/property-chat/search` | `backend/api/routes/property_chat.py` | Mobile: app/CustomerChats.tsx, app/PropertyChats.tsx, app/PropertyChatsMessages.tsx ; Web: src/components/PropertyLiveChatUpdates.js |
| `USED_IN_BOTH` | `POST` | `/property-chat/send` | `backend/api/routes/property_chat.py` | Mobile: app/CustomerChats.tsx, app/PropertyChatsMessages.tsx, app/TaskList.tsx, app/TaskManagementForm.tsx, utils/outbox.ts ; Web: src/components/CustomNodeWithAddButton.js, src/components/PropertyLiveChatUpdates.js, src/components/TaskManager.js, src/components/WorkflowDiagram.js |
| `USED_IN_BOTH` | `GET` | `/request/{request_id}` | `backend/api/routes/inventory.py` | Mobile: app/RequestedInventory.tsx ; Web: src/components/RequestedInventorySection.js |
| `USED_IN_BOTH` | `GET` | `/schedule_update/{scheduleid}` | `backend/api/routes/schedule.py` | Mobile: app/TaskManagementForm.tsx ; Web: src/components/InventoryModel.js, src/components/PhaseDetailsModal.js, src/components/TaskManager.js |
| `USED_IN_BOTH` | `GET` | `/schedule/{scheduleid}/notes_get` | `backend/api/routes/schedule.py` | Mobile: app/CustomerTaskWorkflow.tsx ; Web: src/components/WorkflowDiagram.js |
| `USED_IN_BOTH` | `POST` | `/task-updates` | `backend/api/routes/schedule.py` | Mobile: app/TaskList.tsx, app/TaskManagementForm.tsx, utils/outbox.ts ; Web: src/components/CustomNodeWithAddButton.js, src/components/InventoryModel.js, src/components/PhaseDetailsModal.js, src/components/TaskManager.js, src/components/TaskUpdate.js, src/components/TaskUpdates.js, src/components/WorkflowDiagram.js |
| `USED_IN_BOTH` | `GET` | `/ticket-chat/list/{issue_id}` | `backend/api/routes/tickets.py` | Mobile: app/TicketDetails.tsx ; Web: src/components/TicketDetailsDialog.js |
| `USED_IN_BOTH` | `POST` | `/ticket-chat/send` | `backend/api/routes/tickets.py` | Mobile: app/TicketDetails.tsx ; Web: src/components/TicketDetailsDialog.js |
| `USED_IN_BOTH` | `GET` | `/tickets/{issue_id}` | `backend/api/routes/tickets.py` | Mobile: app/TicketDetails.tsx ; Web: src/components/TicketDetailsDialog.js |
| `USED_IN_BOTH` | `GET` | `/tickets/all` | `backend/api/routes/tickets.py` | Mobile: app/ReviewEngineer.tsx ; Web: src/components/ProjectOnboarding-sp.js, src/components/Tickets.js, src/components/TicketsTab.js |
| `USED_IN_BOTH` | `GET` | `/tickets/property/{property_id}` | `backend/api/routes/tickets.py` | Mobile: app/PropertyChats.tsx, app/PropertyReviewEngineer.tsx ; Web: src/components/ScheduleSummaryDialog.js |
| `USED_IN_BOTH` | `PATCH` | `/update-request/{request_id}` | `backend/main.py` | Mobile: app/EditDeleteInventory.tsx ; Web: src/components/InventoryManagement.js |
| `USED_IN_BOTH` | `PUT` | `/update-schedule/{scheduleid}` | `backend/api/routes/schedule.py` | Mobile: app/TaskManagementForm.tsx, utils/outbox.ts ; Web: src/components/CustomNodeWithAddButton.js, src/components/InventoryModel.js, src/components/PhaseDetailsModal.js, src/components/TaskManager.js, src/components/WorkflowDiagram.js |
| `USED_IN_BOTH` | `GET` | `/work-types` | `backend/api/routes/daily_work.py` | Mobile: app/ManPower.tsx ; Web: src/components/ContractorOnboardingForm.js |

## Mobile-Only APIs

These routes are currently referenced in mobile only.

| Tag | Method | Endpoint | Backend Source | Frontend References |
| --- | --- | --- | --- | --- |
| `MOBILE_ONLY` | `GET` | `/all-requests/{employee_code}` | `backend/api/routes/inventory.py` | Mobile: app/RequestedInventory.tsx |
| `MOBILE_ONLY` | `GET` | `/all-requests/{employee_code}/delta` | `backend/api/routes/inventory.py` | Mobile: app/RequestedInventory.tsx |
| `MOBILE_ONLY` | `GET` | `/assigned-employees/{property_id}` | `backend/api/routes/properties.py` | Mobile: app/PropertyRaiseIssue.tsx, app/RaiseIssue.tsx |
| `MOBILE_ONLY` | `GET` | `/clients-phone/{phone_number}` | `backend/api/routes/clients.py` | Mobile: app/CustomerHomeScreen.tsx |
| `MOBILE_ONLY` | `GET` | `/customer-ticket-chat/{ticket_id}` | `backend/api/routes/tickets.py` | Mobile: app/CustomerChats.tsx, app/PropertyChats.tsx |
| `MOBILE_ONLY` | `GET` | `/employee-properties/{employee_code}` | `backend/api/routes/properties.py` | Mobile: app/PropertiesChatList.tsx, app/PropertiesScreen.tsx |
| `MOBILE_ONLY` | `GET` | `/employee-property-tasks/{employee_code}` | `backend/api/routes/employees.py` | Mobile: app/TaskList.tsx |
| `MOBILE_ONLY` | `GET` | `/employees/{phone_number}` | `backend/api/routes/employees.py` | Mobile: app/HomeScreen.tsx |
| `MOBILE_ONLY` | `GET` | `/employees/{employee_code}/home-summary` | `backend/api/routes/employees.py` | Mobile: app/HomeScreen.tsx, app/PropertyInventory.tsx |
| `MOBILE_ONLY` | `POST` | `/forgot-password` | `backend/main.py` | Mobile: app/LoginPage.tsx |
| `MOBILE_ONLY` | `GET` | `/get-latest-version` | `backend/main.py` | Mobile: hooks/useAppVersionControl.ts |
| `MOBILE_ONLY` | `POST` | `/issue-stock-up` | `backend/api/routes/inventory.py` | Mobile: app/InventoryScanResult.tsx |
| `MOBILE_ONLY` | `GET` | `/issue-types` | `backend/api/routes/tickets.py` | Mobile: app/PropertyRaiseIssue.tsx, app/RaiseIssue.tsx |
| `MOBILE_ONLY` | `POST` | `/log-version` | `backend/main.py` | Mobile: hooks/useAppVersionControl.ts |
| `MOBILE_ONLY` | `POST` | `/login-password` | `backend/main.py` | Mobile: app/LoginPage.tsx |
| `MOBILE_ONLY` | `POST` | `/logout/` | `backend/api/routes/login.py` | Mobile: app/CustomerHomeScreen.tsx, app/index.tsx |
| `MOBILE_ONLY` | `POST` | `/prelogin/register-device` | `backend/main.py` | Mobile: utils/registerPrelogin.ts |
| `MOBILE_ONLY` | `GET` | `/properties/{property_key}/requests` | `backend/api/routes/properties.py` | Mobile: app/PropertyInventory.tsx |
| `MOBILE_ONLY` | `POST` | `/property-chat/{property_id}/{message_id}/pin` | `backend/api/routes/property_chat.py` | Mobile: app/CustomerChats.tsx |
| `MOBILE_ONLY` | `GET` | `/property-chat/{property_id}/pinned` | `backend/api/routes/property_chat.py` | Mobile: app/CustomerChats.tsx, app/PropertyChats.tsx, app/PropertyChatsMessages.tsx |
| `MOBILE_ONLY` | `GET` | `/property-chat/{property_id}/starred` | `backend/api/routes/property_chat.py` | Mobile: app/CustomerChats.tsx, app/PropertyChats.tsx, app/PropertyChatsMessages.tsx |
| `MOBILE_ONLY` | `GET` | `/property/{property_id}/workers` | `backend/api/routes/properties.py` | Mobile: app/PropertyWorkers.tsx |
| `MOBILE_ONLY` | `POST` | `/raise-stock` | `backend/api/routes/inventory.py` | Mobile: app/InventoryScanResult.tsx |
| `MOBILE_ONLY` | `POST` | `/register-push-token` | `backend/main.py` | Mobile: hooks/useRegisterPushToken.ts |
| `MOBILE_ONLY` | `POST` | `/reject-stock` | `backend/api/routes/inventory.py` | Mobile: app/InventoryScanResult.tsx |
| `MOBILE_ONLY` | `POST` | `/request-inventory` | `backend/api/routes/inventory.py` | Mobile: app/InventoryItemDetails.tsx, app/MultipleRequestMasterItem.tsx |
| `MOBILE_ONLY` | `POST` | `/return-stock` | `backend/api/routes/inventory.py` | Mobile: app/StockRequestDetails.tsx |
| `MOBILE_ONLY` | `POST` | `/send-otp/` | `backend/api/routes/login.py` | Mobile: app/LoginPage.tsx |
| `MOBILE_ONLY` | `POST` | `/tickets/{issue_id}/close` | `backend/api/routes/tickets.py` | Mobile: app/PropertyChats.tsx, app/TicketDetails.tsx |
| `MOBILE_ONLY` | `POST` | `/tickets/{issue_id}/reopen` | `backend/api/routes/tickets.py` | Mobile: app/PropertyChats.tsx |
| `MOBILE_ONLY` | `POST` | `/tickets/{issue_id}/request-close` | `backend/api/routes/tickets.py` | Mobile: app/TicketDetails.tsx |
| `MOBILE_ONLY` | `POST` | `/tickets/create` | `backend/api/routes/tickets.py` | Mobile: app/PropertyRaiseIssue.tsx, app/RaiseIssue.tsx |
| `MOBILE_ONLY` | `GET` | `/tickets/property/{property_id}/customer` | `backend/api/routes/tickets.py` | Mobile: app/CustomerChats.tsx |
| `MOBILE_ONLY` | `POST` | `/tickets/update-title` | `backend/api/routes/tickets.py` | Mobile: app/PropertyChats.tsx |
| `MOBILE_ONLY` | `POST` | `/trigger-notification` | `backend/main.py` | Mobile: app/CustomerChats.tsx, app/PropertyChats.tsx, app/PropertyChatsMessages.tsx |
| `MOBILE_ONLY` | `POST` | `/verify-otp/` | `backend/api/routes/login.py` | Mobile: app/LoginPage.tsx |
| `MOBILE_ONLY` | `POST` | `/verify-session/` | `backend/api/routes/login.py` | Mobile: app/CustomerHomeScreen.tsx, hooks/useSessionRedirect.ts |
| `MOBILE_ONLY` | `GET` | `/worker/{worker_id}/summary` | `backend/api/routes/daily_work.py` | Mobile: app/ManPowerListDetails.tsx |

## Web-Only APIs

These routes are currently referenced in web only.

| Tag | Method | Endpoint | Backend Source | Frontend References |
| --- | --- | --- | --- | --- |
| `WEB_ONLY` | `POST` | `/add-item-price-history-bulk` | `backend/api/routes/master_items.py` | Web: src/components/ReadyForReviewForm.js |
| `WEB_ONLY` | `POST` | `/add-schedule-node` | `backend/api/routes/schedule.py` | Web: src/components/CustomNodeWithAddButton.js, src/components/WorkflowDiagram.js |
| `WEB_ONLY` | `PATCH` | `/add-stock/{item_name:path}` | `backend/api/routes/inventory.py` | Web: src/components/StockAdjustment.js |
| `WEB_ONLY` | `GET` | `/alerts` | `backend/api/routes/inventory.py` | Web: src/components/AppBarWithSearch.js |
| `WEB_ONLY` | `GET` | `/all-inventory` | `backend/api/routes/inventory.py` | Web: src/components/InventoryList.js, src/components/Inventory_presnt.js, src/components/MaterialsSection.js |
| `WEB_ONLY` | `GET` | `/all-requests/stats` | `backend/api/routes/inventory.py` | Web: src/components/RequestedInventorySection.js |
| `WEB_ONLY` | `GET` | `/askquery` | `backend/main.py` | Web: src/components/ChatBoxAi.js |
| `WEB_ONLY` | `GET` | `/batch-issues-by-item` | `backend/api/routes/inventory.py` | Web: src/components/InventoryPage.js, src/components/MasterItemDetails.js, src/components/MasterItemDetailsDialog.js |
| `WEB_ONLY` | `GET` | `/check-invoice/{invoice_number}` | `backend/api/routes/invoices.py` | Web: src/components/UploadInvoice.js, src/components/UploadTaxInvoice.js |
| `WEB_ONLY` | `GET` | `/clients` | `backend/api/routes/clients.py` | Web: src/components/ClientManagement.js, src/components/ClientView.js |
| `WEB_ONLY` | `POST` | `/clients` | `backend/api/routes/clients.py` | Web: src/components/AddClientDialog.js |
| `WEB_ONLY` | `PUT` | `/clients/{client_id}` | `backend/api/routes/clients.py` | Web: src/components/ClientDetailsDialog.js |
| `WEB_ONLY` | `POST` | `/clients/{client_id}/assign-properties` | `backend/api/routes/clients.py` | Web: src/components/ClientDetailsDialog.js |
| `WEB_ONLY` | `POST` | `/clients/approve-assignment` | `backend/api/routes/clients.py` | Web: src/components/ClientDetailsDialog.js |
| `WEB_ONLY` | `POST` | `/close-hold` | `backend/api/routes/schedule.py` | Web: src/components/EditHoldsDialog.js |
| `WEB_ONLY` | `POST` | `/close-request-with-remaining-items/` | `backend/api/routes/inventory.py` | Web: src/components/InventoryRequestDialog.js |
| `WEB_ONLY` | `GET` | `/contractors` | `backend/api/routes/daily_work.py` | Web: src/components/Backup.js, src/components/ContractorOnboarding.js, src/components/ContractorOnboardingForm.js |
| `WEB_ONLY` | `POST` | `/contractors` | `backend/api/routes/daily_work.py` | Web: src/components/Backup.js |
| `WEB_ONLY` | `GET` | `/contractors_l/{contractor_id}` | `backend/api/routes/daily_work.py` | Web: src/components/ManPowerDetail.js, src/components/ManpowerDetails.js |
| `WEB_ONLY` | `GET` | `/contractors/{contractor_id}` | `backend/api/routes/daily_work.py` | Web: src/components/Backup.js, src/components/ContractorOnboarding.js, src/components/ContractorOnboardingForm.js |
| `WEB_ONLY` | `POST` | `/create_property_dynamic` | `backend/main.py` | Web: src/components/CreatePropertyDialog.js |
| `WEB_ONLY` | `POST` | `/create-master-item` | `backend/api/routes/master_items.py` | Web: src/components/BulkStockTransferDialog.js, src/components/CreateItemDialog.js, src/components/MasterItems.js, src/components/NewItemForm.js |
| `WEB_ONLY` | `POST` | `/create-schedule-up` | `backend/api/routes/schedule.py` | Web: src/components/PropertyPhaseInventoryTab.js, src/components/ScheduleCreationDialog.js |
| `WEB_ONLY` | `POST` | `/create-uom` | `backend/api/routes/basic_uom.py` | Web: src/components/BasicUOM.js |
| `WEB_ONLY` | `POST` | `/create-vendor` | `backend/api/routes/vendors.py` | Web: src/components/CreateVendorForm.js |
| `WEB_ONLY` | `GET` | `/d_summary/phase-alerts/{date}` | `backend/api/routes/schedule.py` | Web: src/components/DailyUpdates.js |
| `WEB_ONLY` | `GET` | `/d_summary/task-updates/{date}` | `backend/api/routes/schedule.py` | Web: src/components/Calendar.js, src/components/DailyUpdates.js |
| `WEB_ONLY` | `GET` | `/daily-work/property-wise-summary` | `backend/api/routes/daily_work.py` | Web: src/components/Work-Summary.js |
| `WEB_ONLY` | `GET` | `/dashboard/cost-spend` | `backend/main.py` | Web: src/components/DashBoardPage.js |
| `WEB_ONLY` | `GET` | `/dashboard/inventory` | `backend/main.py` | Web: src/components/DashBoardPage.js |
| `WEB_ONLY` | `GET` | `/dashboard/inventory/low-stock-items` | `backend/main.py` | Web: src/components/DashBoardPage.js |
| `WEB_ONLY` | `GET` | `/dashboard/projects-status` | `backend/main.py` | Web: src/components/DashBoardPage.js |
| `WEB_ONLY` | `GET` | `/dashboard/total-projects` | `backend/main.py` | Web: src/components/DashBoardPage.js |
| `WEB_ONLY` | `GET` | `/dashboard/total-properties` | `backend/main.py` | Web: src/components/DashBoardPage.js |
| `WEB_ONLY` | `GET` | `/dashboard/total-vendors` | `backend/main.py` | Web: src/components/DashBoardPage.js |
| `WEB_ONLY` | `GET` | `/dashboard/warehouse-inventory-value` | `backend/main.py` | Web: src/components/DashBoardPage.js |
| `WEB_ONLY` | `POST` | `/delete-invoice-item` | `backend/api/routes/invoices.py` | Web: src/components/ReadyForReviewForm.js |
| `WEB_ONLY` | `DELETE` | `/delete-schedule/{scheduleid}` | `backend/api/routes/schedule.py` | Web: src/components/CustomNodeWithAddButton.js |
| `WEB_ONLY` | `GET` | `/download-schedule/{property_id}` | `backend/api/routes/schedule.py` | Web: src/components/WorkflowDiagram.js |
| `WEB_ONLY` | `GET` | `/employee-project/{employee_code}` | `backend/api/routes/projects.py` | Web: src/components/Employee_Details.js |
| `WEB_ONLY` | `GET` | `/employee-properties/{project_id}/{employee_code}` | `backend/api/routes/properties.py` | Web: src/components/Employee_Details.js |
| `WEB_ONLY` | `PUT` | `/employee/{employee_code}` | `backend/api/routes/employees.py` | Web: src/components/Employee_Details.js |
| `WEB_ONLY` | `POST` | `/employee/{employee_code}/assign` | `backend/api/routes/employees.py` | Web: src/components/Employee_Details.js |
| `WEB_ONLY` | `POST` | `/employee/{employee_code}/unassign` | `backend/api/routes/employees.py` | Web: src/components/Employee_Details.js |
| `WEB_ONLY` | `GET` | `/estimates/{estimate_id}` | `backend/api/routes/inventory.py` | Web: src/components/estimateList.js |
| `WEB_ONLY` | `GET` | `/estimates/list` | `backend/api/routes/inventory.py` | Web: src/components/estimateList.js |
| `WEB_ONLY` | `GET` | `/forgot-password-users` | `backend/main.py` | Web: src/components/ResetPasswordPage.js |
| `WEB_ONLY` | `GET` | `/get-all-invoices` | `backend/api/routes/invoices.py` | Web: src/components/BillsList.js, src/components/ManageInventory.js |
| `WEB_ONLY` | `GET` | `/get-all-masteritems-new-non-paginated` | `backend/api/routes/master_items.py` | Web: src/components/ItemDropdown.js, src/components/MasterItems.js, src/components/StockAdjustment.js |
| `WEB_ONLY` | `GET` | `/get-all-masteritems/{item_type}` | `backend/api/routes/master_items.py` | Web: src/components/MasterItems.js |
| `WEB_ONLY` | `GET` | `/get-all-uom` | `backend/api/routes/basic_uom.py` | Web: src/components/MasterItemDetailsDialog.js |
| `WEB_ONLY` | `GET` | `/get-all-vendors` | `backend/api/routes/vendors.py` | Web: src/components/VendorDetails.js, src/components/VendorDropdown.js |
| `WEB_ONLY` | `GET` | `/get-invoice/{id}` | `backend/api/routes/invoices.py` | Web: src/components/BillsList.js, src/components/ManageInventory.js, src/components/ProformaInvoice.js |
| `WEB_ONLY` | `GET` | `/get-item-history/{item_id}` | `backend/api/routes/master_items.py` | Web: src/components/MasterItemDetails.js, src/components/MasterItemDetailsDialog.js |
| `WEB_ONLY` | `GET` | `/get-item-with-uom/{item_id}` | `backend/api/routes/basic_uom.py` | Web: src/components/BulkStockTransferDialog.js, src/components/MasterItemDetailsDialog.js |
| `WEB_ONLY` | `GET` | `/get-transactions/{entity_type}/{entity_id}` | `backend/api/routes/transactions.py` | Web: src/components/ReadyForPaymentForm.js |
| `WEB_ONLY` | `GET` | `/get-vendor` | `backend/api/routes/vendors.py` | Web: src/components/VendorDetailsComponent.js |
| `WEB_ONLY` | `DELETE` | `/hard-delete-master-item/{item_id}` | `backend/api/routes/master_items.py` | Web: src/components/MasterItemDetails.js, src/components/MasterItemDetailsDialog.js |
| `WEB_ONLY` | `POST` | `/hold-schedule` | `backend/api/routes/schedule.py` | Web: src/components/CustomNodeWithAddButton.js |
| `WEB_ONLY` | `GET` | `/holidays` | `backend/api/routes/holidays.py` | Web: src/components/Calendar.js, src/components/CalenderView.js |
| `WEB_ONLY` | `DELETE` | `/holidays/{holiday_id}` | `backend/api/routes/holidays.py` | Web: src/components/Calendar.js, src/components/CalenderView.js |
| `WEB_ONLY` | `POST` | `/holidays/upload` | `backend/api/routes/holidays.py` | Web: src/components/Calendar.js, src/components/CalenderView.js |
| `WEB_ONLY` | `GET` | `/inventory/` | `backend/api/routes/inventory.py` | Web: src/components/StockAdjustment.js |
| `WEB_ONLY` | `GET` | `/inventory-property/{property_key}/issued-items` | `backend/main.py` | Web: src/components/InventoryPage.js |
| `WEB_ONLY` | `POST` | `/inventory-updates` | `backend/api/routes/inventory.py` | Web: src/components/InventoryManagement.js |
| `WEB_ONLY` | `GET` | `/inventory-updates/{request_id}` | `backend/api/routes/inventory.py` | Web: src/components/InventoryManagement.js |
| `WEB_ONLY` | `POST` | `/inventory/forecast/forecast/draft-all-phases` | `backend/main.py` | Web: src/components/PropertyPhaseInventoryTab.js |
| `WEB_ONLY` | `POST` | `/inventory/forecast/forecast/plan-all-phases` | `backend/main.py` | Web: src/components/PropertyPhaseInventoryTab.js |
| `WEB_ONLY` | `GET` | `/inventory/forecast/forecast/planned-pricing` | `backend/main.py` | Web: src/components/PropertyPhaseInventoryTab.js |
| `WEB_ONLY` | `DELETE` | `/inventory/forecast/forecast/results` | `backend/main.py` | Web: src/components/PropertyPhaseInventoryTab.js |
| `WEB_ONLY` | `GET` | `/inventory/forecast/forecast/results` | `backend/main.py` | Web: src/components/PropertyPhaseInventoryTab.js |
| `WEB_ONLY` | `POST` | `/inventory/forecast/forecast/save-ad-hoc-items` | `backend/main.py` | Web: src/components/PropertyPhaseInventoryTab.js |
| `WEB_ONLY` | `GET` | `/inventory/forecast/templates` | `backend/main.py` | Web: src/components/PropertyPhaseInventoryTab.js |
| `WEB_ONLY` | `DELETE` | `/inventory/forecast/templates/{template_id}` | `backend/main.py` | Web: src/components/PropertyPhaseInventoryTab.js |
| `WEB_ONLY` | `POST` | `/inventory/forecast/templates/{template_id}/add-phase-items` | `backend/main.py` | Web: src/components/PropertyPhaseInventoryTab.js |
| `WEB_ONLY` | `POST` | `/inventory/forecast/templates/copy` | `backend/main.py` | Web: src/components/PropertyPhaseInventoryTab.js |
| `WEB_ONLY` | `POST` | `/inventory/forecast/templates/upload-excel` | `backend/main.py` | Web: src/components/PropertyPhaseInventoryTab.js |
| `WEB_ONLY` | `GET` | `/inventory/location-price-summary` | `backend/api/routes/inventory.py` | Web: src/components/LocationPriceSummaryDialog.js |
| `WEB_ONLY` | `GET` | `/inventory/property/{property_id}` | `backend/api/routes/inventory.py` | Web: src/components/InventoryPage.js, src/components/PropertyDetailsDialog.js, src/components/PropertyPhaseInventoryTab.js |
| `WEB_ONLY` | `PUT` | `/inventory/property/batch-update` | `backend/api/routes/inventory.py` | Web: src/components/InventoryPage.js |
| `WEB_ONLY` | `POST` | `/inventory/property/upload` | `backend/api/routes/inventory.py` | Web: src/components/InventoryPage.js |
| `WEB_ONLY` | `GET` | `/invoice-status-count` | `backend/api/routes/invoices.py` | Web: src/components/DashBoardPage.js |
| `WEB_ONLY` | `GET` | `/issue-stock-logs` | `backend/api/routes/inventory.py` | Web: src/components/IssueLogs.js |
| `WEB_ONLY` | `GET` | `/labors` | `backend/api/routes/daily_work.py` | Web: src/components/LaborOnboarding.js, src/components/LaborOnboardingForm.js |
| `WEB_ONLY` | `POST` | `/labors` | `backend/api/routes/daily_work.py` | Web: src/components/LaborOnboarding.js |
| `WEB_ONLY` | `GET` | `/labors/{labor_id}` | `backend/api/routes/daily_work.py` | Web: src/components/LaborOnboarding.js, src/components/LaborOnboardingForm.js, src/components/ManPowerDetail.js, src/components/ManpowerDetails.js |
| `WEB_ONLY` | `PUT` | `/labors/{labor_id}` | `backend/api/routes/daily_work.py` | Web: src/components/LaborOnboarding.js |
| `WEB_ONLY` | `GET` | `/latest-ready-for-review-invoices` | `backend/api/routes/invoices.py` | Web: src/components/DashBoardPage.js |
| `WEB_ONLY` | `GET` | `/low-stock` | `backend/api/routes/inventory.py` | Web: src/components/LowStockView.js |
| `WEB_ONLY` | `POST` | `/manpower/assignments` | `backend/api/routes/daily_work.py` | Web: src/components/AssignWorker.js, src/components/ManPower-sp.js, src/components/assign_worker.js |
| `WEB_ONLY` | `PATCH` | `/master-item/rename-and-migrate/{master_item_id}` | `backend/api/routes/inventory.py` | Web: src/components/BulkStockTransferDialog.js, src/components/MasterItemDetailsDialog.js |
| `WEB_ONLY` | `GET` | `/materials/{taskid}` | `backend/api/routes/schedule.py` | Web: src/components/InventoryManagement.js |
| `WEB_ONLY` | `POST` | `/merge-schedule-with-reschedule` | `backend/api/routes/schedule.py` | Web: src/components/WorkflowDiagram.js |
| `WEB_ONLY` | `PUT` | `/notes/{note_id}` | `backend/api/routes/schedule.py` | Web: src/components/CustomNodeWithAddButton.js |
| `WEB_ONLY` | `POST` | `/payments/create` | `backend/api/routes/payments.py` | Web: src/components/PaySlipDialog.js |
| `WEB_ONLY` | `GET` | `/payments/list` | `backend/api/routes/payments.py` | Web: src/components/PaymentWorkerTab.js |
| `WEB_ONLY` | `POST` | `/payments/update-status` | `backend/api/routes/payments.py` | Web: src/components/InvoiceViewDialog.js |
| `WEB_ONLY` | `GET` | `/projects` | `backend/api/routes/projects.py` | Web: src/components/ProjectsList.js |
| `WEB_ONLY` | `GET` | `/projects_ids` | `backend/api/routes/projects.py` | Web: src/components/CreateInventoryModal.js, src/components/StockAdjustment.js |
| `WEB_ONLY` | `POST` | `/projects_m` | `backend/api/routes/projects.py` | Web: src/components/ProjectForm.js, src/components/ProjectOnboardingForm.js, src/components/PropertiesOnboardingForm.js |
| `WEB_ONLY` | `GET` | `/projects_m/{project_id}` | `backend/api/routes/projects.py` | Web: src/components/ProjectDetails.js |
| `WEB_ONLY` | `PUT` | `/projects_m/{project_id}` | `backend/api/routes/projects.py` | Web: src/components/ProjectDetails.js |
| `WEB_ONLY` | `GET` | `/projects/{project_id}/segments` | `backend/api/routes/projects.py` | Web: src/components/ProjectsList.js |
| `WEB_ONLY` | `POST` | `/projects/{project_id}/segments` | `backend/api/routes/projects.py` | Web: src/components/ProjectsList.js |
| `WEB_ONLY` | `GET` | `/properties_m` | `backend/api/routes/properties.py` | Web: src/components/FinanceView.js, src/components/PropertiesOnboarding.js |
| `WEB_ONLY` | `GET` | `/properties-and-projects` | `backend/api/routes/properties.py` | Web: src/components/ClientDetailsDialog.js |
| `WEB_ONLY` | `POST` | `/properties-documents` | `backend/api/routes/properties.py` | Web: src/components/PropertyDocumentsTab.js |
| `WEB_ONLY` | `GET` | `/properties-documents/{property_id}` | `backend/api/routes/properties.py` | Web: src/components/PropertyDocumentsTab.js |
| `WEB_ONLY` | `GET` | `/properties-employee/{property_id}` | `backend/api/routes/properties.py` | Web: src/components/PropertyEmployeesTab.js |
| `WEB_ONLY` | `POST` | `/properties-employee/bulk` | `backend/api/routes/properties.py` | Web: src/components/PropertyEmployeesTab.js |
| `WEB_ONLY` | `GET` | `/properties-labor/{property_id}` | `backend/api/routes/properties.py` | Web: src/components/LabourExpenses.js, src/components/PropertyEmployeesTab.js, src/components/labour_expense.js |
| `WEB_ONLY` | `GET` | `/properties/{property_id}` | `backend/api/routes/properties.py` | Web: src/components/DailyUpdates.js, src/components/ProjectProperties.js, src/components/PropertiesTab.js |
| `WEB_ONLY` | `PUT` | `/properties/{property_id}` | `backend/api/routes/properties.py` | Web: src/components/PropertyDataEntryPage.js, src/components/PropertyDetailsDialog.js |
| `WEB_ONLY` | `GET` | `/properties/{property_id}/complete` | `backend/main.py` | Web: src/components/PropertyDataEntryPage.js, src/components/PropertyDetailsDialog.js |
| `WEB_ONLY` | `POST` | `/properties/{property_id}/floors` | `backend/main.py` | Web: src/ensure-property-floors.js |
| `WEB_ONLY` | `GET` | `/properties/{property_id}/labour-payments` | `backend/api/routes/properties.py` | Web: src/components/LabourExpenses.js, src/components/PropertyDetailsDialog.js, src/components/labour_expense.js |
| `WEB_ONLY` | `DELETE` | `/properties/{property_id}/schedule` | `backend/api/routes/properties.py` | Web: src/components/PropertyDetailsDialog.js |
| `WEB_ONLY` | `PATCH` | `/properties/{property_id}/soft-delete` | `backend/api/routes/properties.py` | Web: src/components/PropertyDetailsDialog.js |
| `WEB_ONLY` | `PUT` | `/properties/{property_id}/status` | `backend/api/routes/properties.py` | Web: src/components/PropertyDetailsDialog.js |
| `WEB_ONLY` | `POST` | `/properties/upload` | `backend/api/routes/properties.py` | Web: src/components/ProjectDetails.js |
| `WEB_ONLY` | `GET` | `/property-inventory/{property_name}/project/{project_id}` | `backend/api/routes/properties.py` | Web: src/components/PropertyDetailsDialog.js |
| `WEB_ONLY` | `GET` | `/property/{property_id}/assigned-workers` | `backend/api/routes/properties.py` | Web: src/components/LabourExpenses.js, src/components/labour_expense.js |
| `WEB_ONLY` | `GET` | `/property/{property_id}/floors` | `backend/main.py` | Web: src/services/propertyFloorsService.js |
| `WEB_ONLY` | `POST` | `/property/{property_id}/floors` | `backend/main.py` | Web: src/services/propertyFloorsService.js |
| `WEB_ONLY` | `GET` | `/property/{property_id}/floors-and-areas` | `backend/main.py` | Web: src/components/PropertyPhaseInventoryTab.js |
| `WEB_ONLY` | `GET` | `/quickqueries` | `backend/main.py` | Web: src/components/ChatBoxAi.js |
| `WEB_ONLY` | `POST` | `/recalculate-schedule/{scheduleid}` | `backend/api/routes/schedule.py` | Web: src/components/WorkflowDiagram.js |
| `WEB_ONLY` | `PATCH` | `/remove-stock/{item_name:path}` | `backend/api/routes/inventory.py` | Web: src/components/StockAdjustment.js |
| `WEB_ONLY` | `GET` | `/request-item/{item_name}` | `backend/api/routes/inventory.py` | Web: src/components/InventoryRequestDialog.js, src/components/RequestChatDialog.js |
| `WEB_ONLY` | `POST` | `/reset-password` | `backend/main.py` | Web: src/components/ResetPasswordPage.js |
| `WEB_ONLY` | `POST` | `/resume-schedule` | `backend/api/routes/schedule.py` | Web: src/components/CustomNodeWithAddButton.js |
| `WEB_ONLY` | `POST` | `/revert-stock` | `backend/api/routes/inventory.py` | Web: src/components/InventoryRequestDialog.js |
| `WEB_ONLY` | `GET` | `/roles` | `backend/api/routes/roles.py` | Web: src/App.js, src/components/Bills.js, src/components/LoginPage.js, src/components/ReportsTilesPage.js |
| `WEB_ONLY` | `POST` | `/save-invoice-changes` | `backend/api/routes/invoices.py` | Web: src/components/ReadyForReviewForm.js |
| `WEB_ONLY` | `POST` | `/schedule/{scheduleid}/notes` | `backend/api/routes/schedule.py` | Web: src/components/WorkflowDiagram.js |
| `WEB_ONLY` | `POST` | `/send-whatsapp-update/` | `backend/api/routes/whatsapp.py` | Web: src/components/InventoryRequestDialog.js |
| `WEB_ONLY` | `GET` | `/single/inventory/{item_name:path}` | `backend/api/routes/inventory.py` | Web: src/components/InventoryRequestDialog.js, src/components/MasterItemDetailsDialog.js |
| `WEB_ONLY` | `GET` | `/task_updates/{task_id}` | `backend/api/routes/schedule.py` | Web: src/components/TaskUpdate.js |
| `WEB_ONLY` | `GET` | `/task-updates/{schedule_id}` | `backend/api/routes/schedule.py` | Web: src/components/TaskUpdates.js |
| `WEB_ONLY` | `PUT` | `/tickets/{issue_id}/assignees` | `backend/api/routes/tickets.py` | Web: src/components/TicketDetailsDialog.js |
| `WEB_ONLY` | `PATCH` | `/transfer-stock` | `backend/api/routes/inventory.py` | Web: src/components/BulkStockTransferDialog.js, src/components/MasterItemStockTransferDialog.js, src/components/QuickStockTransferDialog.js, src/components/StockTransferDialogV2.js |
| `WEB_ONLY` | `PUT` | `/update-dependencies/{scheduleid}` | `backend/api/routes/schedule.py` | Web: src/components/WorkflowDiagram.js |
| `WEB_ONLY` | `POST` | `/update-inventory-up` | `backend/api/routes/inventory.py` | Web: src/components/CreateInventoryModal.js |
| `WEB_ONLY` | `POST` | `/update-invoice-status` | `backend/api/routes/invoices.py` | Web: src/components/ReadyForReviewForm.js |
| `WEB_ONLY` | `PUT` | `/update-item/{item_id}` | `backend/api/routes/master_items.py` | Web: src/components/MasterItemDetails.js, src/components/MasterItemDetailsDialog.js |
| `WEB_ONLY` | `POST` | `/update-payment-status` | `backend/api/routes/payments.py` | Web: src/components/ReadyForPaymentForm.js |
| `WEB_ONLY` | `POST` | `/update-position/{scheduleid}` | `backend/api/routes/schedule.py` | Web: src/components/WorkflowDiagram.js |
| `WEB_ONLY` | `PUT` | `/update-uom-status/{basic_uom_id}` | `backend/api/routes/basic_uom.py` | Web: src/components/BasicUOM.js |
| `WEB_ONLY` | `PUT` | `/update-uom/{basic_uom_id}` | `backend/api/routes/basic_uom.py` | Web: src/components/BasicUOM.js |
| `WEB_ONLY` | `PUT` | `/update-vendor/{vendor_id}` | `backend/api/routes/vendors.py` | Web: src/components/EditVendorForm.js, src/components/VendorDetailsComponent.js |
| `WEB_ONLY` | `POST` | `/upload-invoice` | `backend/api/routes/invoices.py` | Web: src/components/UploadInvoice.js |
| `WEB_ONLY` | `POST` | `/upload-properties/` | `backend/api/routes/properties.py` | Web: src/components/ViewProperties.js |
| `WEB_ONLY` | `POST` | `/upload-tax-invoice` | `backend/api/routes/invoices.py` | Web: src/components/UploadTaxInvoice.js |
| `WEB_ONLY` | `GET` | `/vendor/{prefix}` | `backend/api/routes/vendors.py` | Web: src/components/ReadyForReviewForm.js |

## Unused Backend APIs

These active backend routes were not found in the current mobile or web frontend scan.

| Tag | Method | Endpoint | Backend Source | Frontend References |
| --- | --- | --- | --- | --- |
| `UNUSED` | `GET` | `/` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/_whoami` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PATCH` | `/add-inventory` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PATCH` | `/add-inventory-up` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/add-masteritem` | `backend/api/routes/master_items.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/allowed-roles` | `backend/api/routes/roles.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/analyze-image` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/ask` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/assignments/{property_id}` | `backend/api/routes/properties.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/audit-log/{request_id}` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/batch` | `backend/api/routes/mobile_events.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/clients/{client_id}` | `backend/api/routes/clients.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/clients/{client_id}/unassign-properties` | `backend/api/routes/clients.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/contractor/{contractor_id}/summary` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `DELETE` | `/contractors/{contractor_id}` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PUT` | `/contractors/{contractor_id}` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/contractors/upload` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/create-schedule` | `backend/api/routes/schedule.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/cron/daily-update/bulk` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/cron/daily-update/per-property` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/cron/test-daily-update-reminder/{employee_code}` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/cron/test-daily-update-reminder/single/{employee_code}` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/current-task/{propertyId}` | `backend/api/routes/schedule.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/daily-work` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/daily-work/filter` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/daily-work/insights` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/daily-work/recent` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/daily-work/summary/today` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/daily-work/unpaid-summary` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/dashboard/executive/active-vs-completed-properties` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/dashboard/executive/onhold-properties` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/dashboard/inventory/issued-vs-available` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/dashboard/inventory/total-stock-value` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/dashboard/pending-tasks` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/dashboard/schedule/delayed-vs-ontrack-phases` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/dashboard/schedule/onhold-phases-by-reason` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/dashboard/schedule/phase-completion-percentage` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/dashboard/total-invoices` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/employee/{employee_code}/assignments` | `backend/api/routes/employees.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `DELETE` | `/employee/{employee_code}/assignments/{assignment_id}` | `backend/api/routes/employees.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/employees-a` | `backend/api/routes/employees.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/employees-get` | `backend/api/routes/employees.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/engineer/{engineer_id}/daily-logs` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/engineer/{engineer_id}/export-logs` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/engineers/performance` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/est-projects` | `backend/api/routes/projects.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/est-properties/{project_id}` | `backend/api/routes/properties.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/estimates/save` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PUT` | `/estimates/update/{estimate_id}` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/export/all-daily-logs` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/export/daily-logs-by-date` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/extract-invoice-hybrid` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/first-task/{propertyId}` | `backend/api/routes/schedule.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/fund-transfer` | `backend/api/routes/finance.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/fund-transfer-batch` | `backend/api/routes/finance.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/generate-qrcode` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/get-account-balances` | `backend/api/routes/finance.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/get-all-items` | `backend/api/routes/master_items.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/get-all-masteritems-new` | `backend/api/routes/master_items.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/get-all-vendors-paginated` | `backend/api/routes/vendors.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/get-balance` | `backend/api/routes/finance.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/get-child-invoices/{avenue_created_invoice_id}` | `backend/api/routes/invoices.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/get-invoice-history/{parent_invoice_id}` | `backend/api/routes/invoices.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/get-payment-status/{cust_uniq_ref}` | `backend/api/routes/finance.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/get-payment-transactions` | `backend/api/routes/finance.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/get-reverse-feeds` | `backend/api/routes/finance.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/get-transaction-logs` | `backend/api/routes/finance.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/get-transaction-status-logs` | `backend/api/routes/finance.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/get-transaction-statuses` | `backend/api/routes/finance.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/get-users/` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/grouped-requests` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/health` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/health/db-cleanup` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/holidays` | `backend/api/routes/holidays.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PUT` | `/holidays/{holiday_id}` | `backend/api/routes/holidays.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/inventory-property/{property_key}/kpis` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/inventory-requests-test/{request_id}/{request_line_id}/add-remark` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/inventory-requests-test/{request_id}/{request_line_id}/remarks` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/inventory-update/{item_name}` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PATCH` | `/inventory/{item_name:path}` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/inventory/forecast/consumption-rates` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/inventory/forecast/consumption-rates` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/inventory/forecast/forecast/add-items` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/inventory/forecast/generate` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/inventory/forecast/property/{property_id}` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/inventory/forecast/schedule-comparison` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/inventory/forecast/templates/{template_id}` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PUT` | `/inventory/forecast/templates/{template_id}` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/inventory/forecast/templates/{template_id}/versions` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/inventory/forecast/templates/create` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/inventory/forecast/templates/for-phase` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/inventory/forecast/templates/results` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/inventory/forecast/templates/sample-excel` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/inventory/forecast/upcoming-phases` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PATCH` | `/inventory/rename-master-item/{master_item_id}` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/inventory/requests/actions` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/invoice/{invoice_id}` | `backend/api/routes/invoices.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/issue-stock` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/issue-stock-multi-up` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/issue-types/add` | `backend/api/routes/tickets.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/labor/upload` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `DELETE` | `/labors/{labor_id}` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/labors/details/{contractor_id}` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/labour/{labour_id}/summary` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/labour/expenses` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/labours/by-contractor/{contractor_id}` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/log-transaction` | `backend/api/routes/transactions.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/lookup/inventory` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/maintenance/low-stock-scan` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/manpower/assigned-contractors` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/manpower/assigned-labors` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/manpower/assignments` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `DELETE` | `/manpower/assignments/{assignment_id}` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/manpower/assignments/{assignment_id}` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PUT` | `/manpower/assignments/{assignment_id}/assign-amount` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/messages` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/messages/{phone_number}` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/messages/summary` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/next--task/{propertyId}` | `backend/api/routes/schedule.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/notify-employee` | `backend/api/routes/employees.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/notify/test` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/oldest-ready-for-review-invoices` | `backend/api/routes/invoices.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/oldest-requests` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/override-invoice` | `backend/api/routes/invoices.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/payments/record-transaction` | `backend/api/routes/payments.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PUT` | `/postpone-task/{task_id}` | `backend/api/routes/schedule.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/project/{project_id}/worker-summary` | `backend/api/routes/projects.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/project/upload` | `backend/api/routes/projects.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/projects` | `backend/api/routes/projects.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `DELETE` | `/projects/{project_id}` | `backend/api/routes/projects.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/projects/{project_id}` | `backend/api/routes/projects.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PUT` | `/projects/{project_id}` | `backend/api/routes/projects.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/properties/{property_id}/floors` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/properties/{property_id}/floors-and-areas` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/properties/{property_id}/location` | `backend/api/routes/properties.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/properties/create` | `backend/api/routes/properties.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `DELETE` | `/properties/schedule/{schedule_id}` | `backend/api/routes/properties.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/properties/schedule/{schedule_id}` | `backend/api/routes/properties.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PUT` | `/properties/schedule/{schedule_id}` | `backend/api/routes/properties.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/property-chat/{property_id}/client-view` | `backend/api/routes/property_chat.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/property-chat/{message_id}/edit` | `backend/api/routes/property_chat.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/property-chat/{property_id}/important` | `backend/api/routes/property_chat.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/property-chat/grouped-by-ticket/{property_id}` | `backend/api/routes/property_chat.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/property-chat/link-ticket` | `backend/api/routes/property_chat.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/property-chat/search-by-ticket` | `backend/api/routes/property_chat.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/property/{property_name}/item_status` | `backend/api/routes/properties.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/property/{property_id}/workers/{worker_kind}/{worker_id}/entries` | `backend/api/routes/properties.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/property/schedule` | `backend/api/routes/schedule.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/raise-inventory` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PUT` | `/raise-inventory-multi-up` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/redistribute-percentages` | `backend/api/routes/schedule.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PUT` | `/reject-inventory-multi-up` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/request-inventory-multi-up` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/request-inventory-test` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/request-inventory/{request_id}` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/request-test/{request_id}` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/requests/{request_id}/actions` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/return-stock-logs` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/reverse-feed` | `backend/api/routes/finance.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/reverse-feed-logs` | `backend/api/routes/finance.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PUT` | `/revert-stock-multi-up` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/save-position/{scheduleid}` | `backend/api/routes/schedule.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/schedule-types` | `backend/api/routes/schedule.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/schedule/upload` | `backend/api/routes/schedule.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/schedule/upload/{property_id}` | `backend/api/routes/schedule.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/schema` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/send-notifications` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/single-request/{request_id}` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/single/inventory` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PUT` | `/start-task/{task_id}` | `backend/api/routes/schedule.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/status-check` | `backend/api/routes/finance.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/stock-adjustment-logs` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/stock-adjustment-logs/{request_id}` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/stock-manager-action` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/suggest_migration` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/task-updates-web` | `backend/api/routes/schedule.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/temporal/health` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/temporal/namespace-check` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/temporal/smoke` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/test` | `backend/api/routes/schedule.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/testing-claude` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/tickets/all-paginated` | `backend/api/routes/tickets.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/tickets/assigned-to/{employee_code}` | `backend/api/routes/tickets.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/tickets/property/{property_id}/paginated` | `backend/api/routes/tickets.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PATCH` | `/toggle-uom-status/{basic_uom_id}` | `backend/api/routes/basic_uom.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/top/contractors/by-sqft` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/top/labours/by-hours` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PATCH` | `/update-inventory-test/{request_line_id}` | `backend/api/routes/inventory.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PUT` | `/update-invoicestatus` | `backend/api/routes/invoices.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `PUT` | `/update-task/{task_id}` | `backend/api/routes/schedule.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/upload-mock` | `backend/api/routes/schedule.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/vaibhavi` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/webhook` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/webhook` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/webpush/list` | `backend/api/routes/webpush.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/webpush/register` | `backend/api/routes/webpush.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/webpush/send` | `backend/main.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `DELETE` | `/webpush/unregister` | `backend/api/routes/webpush.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/worker/{worker_id}/summary/export` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `GET` | `/worker/{worker_id}/summary/export/filter` | `backend/api/routes/daily_work.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/workers/payment-calculate` | `backend/api/routes/payments.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/workers/payment-summary` | `backend/api/routes/payments.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |
| `UNUSED` | `POST` | `/ws/broadcast` | `backend/api/routes/schedule.py` | Not referenced in current `app/`, `src/`, `utils/`, or `hooks/` scan |

## Supplemental CRM Mobile-Only APIs

These mobile-only routes live under `backend/crm/router.py` and are used by the sales-role screens. They are documented separately because the original generated scan only indexed `backend/main.py` and `backend/api/routes/*.py`.

| Tag | Method | Endpoint | Backend Source | Frontend References |
| --- | --- | --- | --- | --- |
| `MOBILE_ONLY` | `GET` | `/crm/leads` | `backend/crm/router.py` | Mobile: app/HomeScreen.tsx, app/SalesDashboard.tsx, app/SalesLeads.tsx, app/SalesClients.tsx |
| `MOBILE_ONLY` | `POST` | `/crm/leads` | `backend/crm/router.py` | Mobile: app/AddLead.tsx |
| `MOBILE_ONLY` | `GET` | `/crm/leads/{lead_id}/detail` | `backend/crm/router.py` | Mobile: app/LeadDetails.tsx |
| `MOBILE_ONLY` | `POST` | `/crm/leads/{lead_id}/move-stage` | `backend/crm/router.py` | Mobile: app/LeadDetails.tsx |
| `MOBILE_ONLY` | `POST` | `/crm/leads/{lead_id}/restore` | `backend/crm/router.py` | Mobile: app/LeadDetails.tsx |
| `MOBILE_ONLY` | `GET` | `/crm/masters` | `backend/crm/router.py` | Mobile: app/AddLead.tsx |
