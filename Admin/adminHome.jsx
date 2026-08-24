import Home from "../components/Home";

export default function AdminHome() {
  return (
    <Home
      bgColor="bg-green-300"
      firstReportsStatus="incoming"
      secondReportsStatus="pending"
      primaryColor="text-green-300"
      title1="Incoming Reports"
      title2={"Materials Request"}
      secColor={"bg-green-500"}
      titleBgColor={"bg-red-300"}
      reportCardHoverColor={"hover:bg-green-700"}
      reportDate1="dateSent"
      reportDate2="dateSent"
      titleBorderColor={"border-red-300"}
      navBarColor="bg-green-300"
      slideInBgColor="bg-green-300"
      reportDetailsBgColor="bg-green-300"
      reportsHiddenOnMobileTitle="Pending Confirmation"
      completedRedirect={"/ac"}
      acceptedRedirect={"/aip"}
      logoBGColor="md:bg-green-500"
      reopenedRedirect={"/aro"}
      closedRedirect={"/acl"}
      homeRedirect="/ah"
      dashboardRedirect={"/ad"}
      role={"admin"}
    />
  );
}
