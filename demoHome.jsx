import Home from "./components/Home";

export default function DemoHome() {
  return (
    <Home
      bgColor="bg-green-300"
      firstReportsStatus="incoming"
      secondReportsStatus="pending"
      primaryColor="text-green-300"
      title1="Incoming Reports"
      title2={"Pending Confirmation"}
      secColor={"bg-green-500"}
      titleBgColor={"bg-red-300"}
      reportCardHoverColor={"hover:bg-green-700"}
      reportDate1="dateSent"
      reportDate2="dateAssigned" //change later to date Estate manager reviewed
      titleBorderColor={"border-red-300"}
    />
  );
}
