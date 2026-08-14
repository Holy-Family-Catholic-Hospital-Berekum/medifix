import Home from "../components/Home";

export default function AdminReOpened() {
  return (
    <Home
      bgColor="bg-[#eff6ff]"
      firstReportsStatus="reopened"
      primaryColor="text-red-800"
      title1="Reopened Works"
      secColor={"bg-yellow-500"}
      titleBgColor={"bg-yellow-500"}
      reportCardHoverColor={"hover:bg-yellow-600"}
      reportDate1="dateReopened"
      titleBorderColor={"border-red-800"}
      navBarColor="bg-red-800"
      slideInBgColor="bg-yellow-500"
      reportDetailsBgColor="bg-green-300"
      specificReportsPage={true}
      completedRedirect={"/ac"}
      acceptedRedirect={"/aip"}
      logoBGColor="md:bg-green-500"
      reopenedRedirect={"/aro"}
      homeRedirect="/ah"
      closedRedirect={"/acl"}
      dashboardRedirect={"/ad"}
      role={"admin"}
    />
  );
}
