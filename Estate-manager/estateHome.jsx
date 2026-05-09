import Home from "../components/Home";

export default function EstateHome() {
  return (
    <Home
      bgColor="bg-[#eff6ff]"
      firstReportsStatus="approved"
      secondReportsStatus="confirmed"
      primaryColor="text-yellow-300"
      title1="Approved Reports"
      title2={"Confirmed Reports"}
      secColor={"bg-blue-500"}
      titleBgColor={"bg-yellow-500"}
      reportCardHoverColor={"hover:bg-blue-600"}
      reportDate1="dateSent"
      reportDate2="dateAssigned" //change later to date admin confirmed
      titleBorderColor={"border-yellow-300"}
      navBarColor="bg-yellow-300"
      slideInBgColor="bg-yellow-300"
      reportDetailsBgColor="bg-green-300"
      reportsHiddenOnMobileTitle="Confirmed Reports"
      specificReportsPage={false}
      overdueRedirect={"/estateOverdue"}
      completedRedirect={"/estateCompleted"}
      assignedRedirect={"estateAssigned"}
      logoBGColor="md:bg-blue-500"
      homeRedirect="/estateHome"
    />
  );
}
