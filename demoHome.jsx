import Home from "./components/Home";

export default function DemoHome() {
  return (
    <Home
      bgColor="bg-[#eff6ff]"
      firstReportsStatus="incoming"
      secondReportsStatus="pending"
      primaryColor="text-yellow-300"
      title1="Incoming Reports"
      title2={"Pending Confirmation"}
      secColor={"bg-blue-500"}
      titleBgColor={"bg-yellow-500"}
      reportCardHoverColor={"hover:bg-blue-600"}
      reportDate1="dateSent"
      reportDate2="dateAssigned" //change later to date Estate manager reviewed
      titleBorderColor={"border-yellow-300"}
      navBarColor="bg-yellow-300"
    />
  );
}
