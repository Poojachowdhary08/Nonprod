import { router } from "expo-router";

export const navigateToTicket = (
  issueId: string,
  employeeData: {
    first_name: string;
    last_name: string;
    email: string;
    job_title: string;
    employee_code: string;
    phone_number: string;
  }
) => {
  if (!issueId || !employeeData) {
    console.warn("Missing issueId or employeeData in navigateToTicket");
    return;
  }

  router.push({
    pathname: "/TicketDetails",
    params: {
      issue_id: issueId,
      ...employeeData,
    },
  });
};