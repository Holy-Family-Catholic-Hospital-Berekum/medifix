import Home from "../components/Home";

export default function EstateHome() {
  return (
    <Home
      bgColor="bg-[#eff6ff]"
      firstReportsStatus={["approved", "costDenied"]}
      secondReportsStatus="procured"
      primaryColor="text-yellow-300"
      title1="Approved / Denied Reports"
      title2="Procured Reports"
      secColor="bg-blue-500"
      titleBgColor="bg-yellow-500"
      reportCardHoverColor="hover:bg-blue-600"
      reportDate1="dateApproved"
      reportDate2="dateProcured"
      titleBorderColor="border-yellow-300"
      navBarColor="bg-yellow-300"
      slideInBgColor="bg-yellow-300"
      reportDetailsBgColor="bg-green-300"
      reportsHiddenOnMobileTitle="Procured Reports"
      specificReportsPage={false}
      completedRedirect="/estateCompleted"
      assignedRedirect="/estateAssigned"
      logoBGColor="md:bg-blue-500"
      homeRedirect="/estateHome"
      dashboardRedirect={"/estateDashboard"}
      role={"estate"}
    />
  );
}
