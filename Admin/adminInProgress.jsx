import Home from "../components/Home";

export default function AdminInProgress() {
  return (
    <Home
      bgColor="bg-[#eff6ff]"
      firstReportsStatus="accepted"
      primaryColor="text-red-800"
      title1="Works in Progress"
      secColor={"bg-yellow-500"}
      titleBgColor={"bg-yellow-500"}
      reportCardHoverColor={"hover:bg-yellow-600"}
      reportDate1="dateAccepted"
      titleBorderColor={"border-red-800"}
      navBarColor="bg-red-800"
      slideInBgColor="bg-yellow-500"
      reportDetailsBgColor="bg-green-300"
      specificReportsPage={true}
      completedRedirect={"/ac"}
      assignedRedirect={"/aip"}
      logoBGColor="md:bg-green-500"
      homeRedirect="/ah"
      dashboardRedirect={"/ad"}
      role={"admin"}
    />
  );
}
