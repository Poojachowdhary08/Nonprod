# Cypress Screen Selectors

Stable root selectors for app screens/pages:

```text
AppFooterNav.tsx -> app-footer-nav-root
AppLayout.tsx -> app-layout-root
AvenueAskScreen.tsx -> avenue-ask-screen-root
ComingSoon.tsx -> coming-soon-root
CustomerChats.tsx -> customer-chats-root
CustomerHomeScreen.tsx -> customer-home-screen-root
CustomerMessageWrapper.tsx -> customer-message-wrapper-root
CustomerProjects.tsx -> customer-projects-root
CustomerProperties.tsx -> customer-properties-root
CustomerPropertiesListScreen.tsx -> customer-properties-list-screen-root
CustomerTaskWorkflow.tsx -> customer-task-workflow-root
DevOutboxPanel.tsx -> dev-outbox-panel-root
EditDeleteInventory.tsx -> edit-delete-inventory-root
EmojiPicker.tsx -> emoji-picker-root
HomeScreen.tsx -> home-screen-root
ImageViewer.tsx -> image-viewer-root
InventoryItemDetails.tsx -> inventory-item-details-root
InventoryScanResult.tsx -> inventory-scan-result-root
InventoryScreen.tsx -> inventory-screen-root
LabourDetailsFormScreen.tsx -> labour-details-form-screen-root
LoginPage.tsx -> login-page-root
ManPower.tsx -> man-power-root
ManPowerList.tsx -> man-power-list-root
ManPowerListDetails.tsx -> man-power-list-details-root
MasterItemDetails.tsx -> master-item-details-root
MasterItems.tsx -> master-items-root
MultipleRequestMasterItem.tsx -> multiple-request-master-item-root
Notifications.tsx -> notifications-root
PDFViewer.tsx -> pdfviewer-root
ProjectsScreen.tsx -> projects-screen-root
PropertiesChatList.tsx -> properties-chat-list-root
PropertiesListScreen.tsx -> properties-list-screen-root
PropertiesMasterItems.tsx -> properties-master-items-root
PropertiesMultiRequestMasterItem.tsx -> properties-multi-request-master-item-root
PropertiesScreen.tsx -> properties-screen-root
PropertyChats.tsx -> property-chats-root
PropertyChatsMessages.tsx -> property-chats-messages-root
PropertyChatsWrapper.tsx -> property-chats-wrapper-root
PropertyDetailsScreen.tsx -> property-details-screen-root
PropertyHistory.tsx -> property-history-root
PropertyInventory.tsx -> property-inventory-root
PropertyRaiseIssue.tsx -> property-raise-issue-root
PropertyReviewEngineer.tsx -> property-review-engineer-root
PropertyUploadedDocuments.tsx -> property-uploaded-documents-root
PropertyWorkers.tsx -> property-workers-root
RaiseIssue.tsx -> raise-issue-root
RedirectAfterLogin.tsx -> redirect-after-login-root
RequestedInventory.tsx -> requested-inventory-root
ReviewEngineer.tsx -> review-engineer-root
ScanImage.tsx -> scan-image-root
ScanQRResult.tsx -> scan-qrresult-root
StockInventoryScreen.tsx -> stock-inventory-screen-root
StockManager.tsx -> stock-manager-root
StockRequestDetails.tsx -> stock-request-details-root
TaskList.tsx -> task-list-root
TaskManagementForm.tsx -> task-management-form-root
TaskSchedule.tsx -> task-schedule-root
TaskWorkflow.tsx -> task-workflow-root
TaskWorkflowWrapper.tsx -> task-workflow-wrapper-root
TicketDetails.tsx -> ticket-details-root
ViewSchedulesForm.tsx -> view-schedules-form-root
WorkerEntriesScreen.tsx -> worker-entries-screen-root
_layout.tsx -> layout-root
index.tsx -> index-root
```

Example Cypress usage:

```js
cy.get('[data-testid="home-screen-root"]');
cy.get('[data-testid="login-page-root"]');
cy.get('[data-testid="property-review-engineer-root"]');
```
