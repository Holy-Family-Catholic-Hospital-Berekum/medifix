import NavBar from "./navBar";
import { useState } from "react";
import SlideInRight from "../components/slideInRight";
import AlertsContainer from "./AlertsContainer";
import { NavLink } from "react-router";
import { nanoid } from "nanoid";
import ReportDetailsContainer from "./reportDetails";
import ReportsHiddenOnMobile from "./reportsHiddenOnMobile";

export default function Home({
  bgColor,
  primaryColor,
  secColor,
  completedRedirect,
  overdueRedirect,
  assignedRedirect,
  title1,
  title2,
  titleBgColor,
  reportDate1,
  reportDate2,
  firstReportsStatus,
  secondReportsStatus,
  reportCardHoverColor,
  titleBorderColor,
  navBarColor,
  slideInBgColor,
  reportDetailsBgColor,
  reportsHiddenOnMobileTitle,
  specificReportsPage,
  logoBGColor,
}) {
  const [sidePopup, setSidePopup] = useState(false);
  const [showReportsHiddenOnMobile, SetShowReportsHiddenOnMobile] =
    useState(false);
  const [displayDetails, setDisplayDetails] = useState(false);
  const [currentReport, setCurrentReport] = useState([]);

  const navClass = ({ isActive }) =>
    `cursor-pointer transition ${
      isActive ? `${primaryColor}` : "text-[#111827] hover:text-blue-200"
    }`;

  const handleClose = () => {
    // give slide-down time to finish before hiding
    setTimeout(() => setFormPopup(false), 300);
  };

  const reports = [
    {
      status: "overdue",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription: "This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "electricals",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "completed",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription: "This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "electricals",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "overdue",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription: "This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "electricals",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "completed",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription: "This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "electricals",
      dateConfirmed: "13/03/2026",
    },
    {
      status: "assigned",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription: "This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "plumbing",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "pending",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription: "This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "plumbing",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "pending",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription: "This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "electricals",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "incoming",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription: "This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "masonery",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "incoming",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription:
        "This is a description of the maintenance report, This is a description of the maintenance report, This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "carpentry",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "incoming",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription:
        "This is a description of the maintenance report, This is a description of the maintenance report, This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "carpentry",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "incoming",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription:
        "This is a description of the maintenance report, This is a description of the maintenance report, This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "carpentry",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "incoming",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription:
        "This is a description of the maintenance report, This is a description of the maintenance report, This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "carpentry",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "approved",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription:
        "This is a description of the maintenance report, This is a description of the maintenance report, This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "carpentry",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "approved",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription:
        "This is a description of the maintenance report, This is a description of the maintenance report, This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "carpentry",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "approved",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription:
        "This is a description of the maintenance report, This is a description of the maintenance report, This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "carpentry",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "confirmed",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription:
        "This is a description of the maintenance report, This is a description of the maintenance report, This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "carpentry",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "confirmed",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription:
        "This is a description of the maintenance report, This is a description of the maintenance report, This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "carpentry",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
    {
      status: "assigned",
      dateSent: "12/03/2026",
      dateApproved: "12/03/2026",
      dateAssigned: "12/03/2026",
      dateCompleted: "13/03/2026",
      cost: 1000,
      reportDescription:
        "This is a description of the maintenance report, This is a description of the maintenance report, This is a description of the maintenance report",
      costDescription:
        "This is a description of the cost involved for this work",
      category: "carpentry",
      dateConfirmed: "13/03/2026",
      id: nanoid(),
    },
  ];

  const displayReportDetails = (id) => {
    setDisplayDetails(true);

    const reportToDisplay = reports.filter((report) => report.id === id);

    setCurrentReport(reportToDisplay);
  };

  const firstReports = reports.filter(
    (report) => report.status === `${firstReportsStatus}`,
  );
  const secondReports = reports.filter(
    (report) => report.status === `${secondReportsStatus}`,
  );

  const firstReportsCard = firstReports.map((report, i) => (
    <div
      className={`${secColor} select-none border border-gray-800 flex flex-col gap-2 items-center justify-center cursor-pointer transition ${reportCardHoverColor} rounded-xl w-full max-w-[250px] md:max-w-[300px] p-2 md:p-4`}
      key={i}
      onClick={() => displayReportDetails(report.id)}
    >
      <h1>{report.category.toUpperCase()}</h1>
      <div className="flex justify-between gap-4">
        <span className="text-blue-200 bg-yellow-800 px-1 rounded">
          {report[reportDate1]}
        </span>
        <span className="text-red-400 bg-gray-800 px-1 rounded">
          {report.status}
        </span>
      </div>
    </div>
  ));

  const secondReportsCard = secondReports.map((report, i) => (
    <div
      className={`${secColor} z-60 border select-none border-yellow-800 md:flex flex-col gap-2 items-center justify-center cursor-pointer transition ${reportCardHoverColor} rounded-xl w-full max-w-[250px] md:max-w-[300px] p-2 md:p-4 ${showReportsHiddenOnMobile ? "flex" : "hidden"} `}
      key={i}
      onClick={() => displayReportDetails(report.id)}
    >
      <h1>{report.category.toUpperCase()}</h1>
      <div className="flex justify-between gap-4">
        <span className="text-blue-200 bg-yellow-800 px-1 rounded">
          {report[reportDate2]}
        </span>
        <span className="text-red-400 bg-gray-800 px-1 rounded">
          {report.status}
        </span>
      </div>
    </div>
  ));

  return (
    <>
      <ReportDetailsContainer
        currentReport={currentReport}
        displayDetails={displayDetails}
        setDisplayDetails={setDisplayDetails}
        reportDetailsBgColor={reportDetailsBgColor}
      />
      {showReportsHiddenOnMobile && (
        <ReportsHiddenOnMobile
          showReportsHiddenOnMobile={showReportsHiddenOnMobile}
          onClose={handleClose}
          reportsHiddenOnMobile={secondReportsCard}
          reportsHiddenOnMobileTitle={reportsHiddenOnMobileTitle}
        />
      )}
      <NavBar navBarColor={navBarColor} logoBGColor={logoBGColor} />
      <SlideInRight
        sidePopup={sidePopup}
        slideInBgColor={slideInBgColor}
        assignedRedirect={assignedRedirect}
        completedRedirect={completedRedirect}
        overdueRedirect={overdueRedirect}
      />
      <div className="md:hidden">
        <span
          className="material-symbols-outlined select-none z-60 fixed cursor-pointer top-1/2 rounded-l-full py-2 pl-2 left-auto right-0 bg-red-400"
          onClick={() => setSidePopup((prev) => !prev)}
        >
          {sidePopup ? "chevron_right" : "chevron_left"}
        </span>
      </div>

      {!specificReportsPage && (
        <div
          className="fixed z-100 bg-red-400 bottom-0 top-auto cursor-pointer left-1/2 -translate-x-1/2 select-none rounded-t-full px-10 py-1 md:hidden"
          onClick={() => SetShowReportsHiddenOnMobile((prev) => !prev)}
        >
          <span className="text-gray-900">
            {showReportsHiddenOnMobile
              ? "Close"
              : `${reportsHiddenOnMobileTitle && reportsHiddenOnMobileTitle.split(" ")[0]}`}
          </span>
        </div>
      )}

      <main className={`flex ${bgColor}`}>
        <div
          className={`w-full fixed inset-y-0 z-10 max-w-[20%] h-screen ${secColor}  md:flex flex-col pt-24 px-10 gap-10 hidden`}
        >
          <NavLink to={`${assignedRedirect}`} className={navClass}>
            Assigned
          </NavLink>
          <NavLink to={`${completedRedirect}`} end className={navClass}>
            Completed
          </NavLink>
          <NavLink to={`${overdueRedirect}`} className={navClass}>
            Overdue
          </NavLink>
        </div>
        <div className="w-full h-screen [scrollbar-width:none] [&::-webkit-scrollbar]:hidden  overflow-y-auto py-24 flex flex-col items-center z-0">
          <h1
            className={`text-xl border-y ${titleBorderColor} md:text-2xl ${primaryColor} font-bold w-full text-center py-2 ${secColor}`}
          >
            {title1}
          </h1>
          <div className="flex lg:max-w-[80%]  md:pl-[200px] gap-4 md:gap-10 justify-center w-full flex-wrap py-10 md:py-20 px-4">
            {firstReportsCard}
          </div>
          {!specificReportsPage && (
            <h1
              className={`text-xl hidden md:block md:text-2xl border-y ${titleBorderColor} ${primaryColor} font-bold w-full text-center py-2 ${secColor}`}
            >
              {title2}
            </h1>
          )}
          {!specificReportsPage && (
            <div className="flex lg:max-w-[80%]  md:pl-[200px] gap-4 md:gap-10 justify-center w-full flex-wrap py-10 md:py-20 px-4">
              {secondReportsCard}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
