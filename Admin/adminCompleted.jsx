import Home from "../components/Home";

export default function Completed() {
  return (
    <Home
      bgColor="bg-green-300"
      firstReportsStatus="completed"
      primaryColor="text-green-300"
      title1="Completed Works"
      secColor="bg-green-500"
      reportCardHoverColor={"hover:bg-green-700"}
      reportDate1="dateCompleted"
      titleBorderColor={"border-red-300"}
      navBarColor="bg-green-300"
      slideInBgColor="bg-green-300"
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
