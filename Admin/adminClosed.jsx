import Home from "../components/Home";

export default function AdminClosed() {
  return (
    <Home
      bgColor="bg-green-300"
      firstReportsStatus="closed"
      primaryColor="text-green-300"
      title1="Closed Works"
      secColor="bg-green-500"
      reportCardHoverColor={"hover:bg-green-700"}
      reportDate1="dateClosed"
      titleBorderColor={"border-red-300"}
      navBarColor="bg-green-300"
      slideInBgColor="bg-green-300"
      reportDetailsBgColor="bg-green-300"
      specificReportsPage={true}
      completedRedirect={"/ac"}
      reopenedRedirect={"/aro"}
      acceptedRedirect={"/aip"}
      closedRedirect={"/acl"}
      logoBGColor="md:bg-green-500"
      homeRedirect="/ah"
      dashboardRedirect={"/ad"}
      role={"admin"}
    />
  );
}
