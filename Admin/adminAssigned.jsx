import Home from "../components/Home";

export default function Assigned() {
  return (
    <Home
      bgColor="bg-green-300"
      firstReportsStatus="assigned"
      primaryColor="text-green-300"
      title1="Assigned Works"
      secColor="bg-green-500"
      reportCardHoverColor={"hover:bg-green-700"}
      reportDate1="dateAssigned"
      titleBorderColor={"border-red-300"}
      navBarColor="bg-green-300"
      slideInBgColor="bg-green-300"
      reportDetailsBgColor="bg-green-300"
      specificReportsPage={true}
      overdueRedirect={"/adminOverdue"}
      completedRedirect={"/adminCompleted"}
      assignedRedirect={"/adminAssigned"}
      logoBGColor="md:bg-green-500"
      homeRedirect="/estateHome"
    />
  );
}
