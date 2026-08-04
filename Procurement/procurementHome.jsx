import Home from "../components/Home";

export default function ProcurementHome() {
  return (
    <Home
      bgColor="bg-[#eff6ff]"
      firstReportsStatus="confirmed"
      primaryColor="text-red-800"
      title1="Confirmed Reports"
      secColor={"bg-yellow-500"}
      titleBgColor={"bg-yellow-500"}
      reportCardHoverColor={"hover:bg-yellow-600"}
      reportDate1="dateAssigned"
      titleBorderColor={"border-red-800"}
      navBarColor="bg-red-800"
      slideInBgColor="bg-yellow-500"
      reportDate1="dateConfirmed"
      reportDetailsBgColor="bg-green-300"
      specificReportsPage={true}
      completedRedirect={"/procurementCompleted"}
      logoBGColor="md:bg-yellow-500"
      homeRedirect="/procurementHome"
      dashboardRedirect={"/procurementDashboard"}
      role={"procurement"}
    />
  );
}
