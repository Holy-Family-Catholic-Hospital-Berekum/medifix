import NavBar from "./navBar";
import { useState, useEffect } from "react";
import SlideInRight from "../components/slideInRight";
import { NavLink } from "react-router";
import { nanoid } from "nanoid";
import ReportDetailsContainer from "./reportDetails";
import ReportsHiddenOnMobile from "./reportsHiddenOnMobile";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  getDocs,
  updateDoc,
  arrayUnion,
  doc,
  setDoc,
} from "firebase/firestore";
import { db } from "../src/firebase";

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
  homeRedirect,
}) {
  const [sidePopup, setSidePopup] = useState(false);
  const [showReportsHiddenOnMobile, SetShowReportsHiddenOnMobile] =
    useState(false);
  const [displayDetails, setDisplayDetails] = useState(false);
  const [currentReport, setCurrentReport] = useState([]);
  const [reports, setReports] = useState([]);

  const user = JSON.parse(localStorage.getItem("user"))?.data;

  const generateRegistrationID = async () => {
    const type = prompt("Enter type: staff or worker");
    if (!type || !["staff", "worker"].includes(type.toLowerCase())) {
      alert("Invalid type. Please enter 'staff' or 'worker'.");
      return;
    }
    try {
      const id = nanoid();
      await setDoc(doc(db, "registrationIDs", id), {
        type: type.toLowerCase(),
        used: false,
      });
      alert(`Registration ID generated: ${id}`);
    } catch (error) {
      console.error("Failed to generate ID:", error);
      alert("Failed to generate registration ID. Please try again.");
    }
  };

  const navClass = ({ isActive }) =>
    `cursor-pointer transition ${
      isActive ? `${primaryColor}` : "text-[#111827] hover:text-blue-200"
    }`;

  const handleClose = () => {
    // give slide-down time to finish before hiding
    setTimeout(() => SetShowReportsHiddenOnMobile(false), 300);
  };

  useEffect(() => {
    const fetchData = async () => {
      const reportsQuery = query(collection(db, "reports"));

      const reportsSnapshot = await getDocs(reportsQuery);

      const reportsData = reportsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      setReports(reportsData);
    };

    fetchData();
  }, []);

  const displayReportDetails = (id) => {
    setDisplayDetails(true);

    const reportToDisplay = reports.filter((report) => report.id === id);

    setCurrentReport(reportToDisplay);
  };

  // Get all alerts for the current user
  const getAllAlerts = () => {
    const allAlerts = [];
    reports.forEach((report) => {
      if (!report.alerts || !Array.isArray(report.alerts)) return;

      report.alerts.forEach((alert) => {
        if (alert.sentTo === user?.role || alert.sentTo === user?.ID) {
          allAlerts.push({
            ...alert,
            reportId: report.id,
            reportCategory: report.category,
          });
        }
      });
    });

    return allAlerts.sort((a, b) => new Date(b.date) - new Date(a.date));
  };

  const alerts = getAllAlerts();

  const firstReports = reports.filter(
    (report) => report.status === `${firstReportsStatus}`,
  );
  const secondReports = reports.filter(
    (report) => report.status === `${secondReportsStatus}`,
  );

  const firstReportsCard = firstReports.map((report, i) => (
    <div
      className={`${report.status !== "completed" && report.priorityLevel === "urgent" ? "bg-red-500" : report.status !== "completed" && report.priorityLevel === "routine" ? secColor : "bg-green-500"} select-none border border-gray-800 flex flex-col gap-2 items-center justify-center cursor-pointer transition ${report.priorityLevel === "routine" ? reportCardHoverColor : "hover:bg-red-600"} rounded-xl w-full max-w-[250px] md:max-w-[300px] p-2 md:p-4`}
      key={i}
      onClick={() => displayReportDetails(report.id)}
    >
      <h1>{report.priorityLevel.toUpperCase()}</h1>
      <div className="flex justify-between gap-4">
        <span className="text-blue-200 bg-yellow-800 px-1 rounded">
          {report[reportDate1]?.toDate().toLocaleDateString()}
        </span>
        <span className="text-red-400 bg-gray-800 px-1 rounded">
          {report.status}
        </span>
      </div>
    </div>
  ));

  const secondReportsCard = secondReports.map((report, i) => (
    <div
      className={`${report.status !== "completed" && report.priorityLevel === "routine" ? secColor : "bg-red-500"} z-60 border select-none border-yellow-800 md:flex flex-col gap-2 items-center justify-center cursor-pointer transition ${report.priorityLevel === "routine" ? reportCardHoverColor : "hover:bg-red-600"} rounded-xl w-full max-w-[250px] md:max-w-[300px] p-2 md:p-4 ${showReportsHiddenOnMobile ? "flex" : "hidden"} `}
      key={i}
      onClick={() => displayReportDetails(report.id)}
    >
      <h1>{report.priorityLevel.toUpperCase()}</h1>
      <div className="flex justify-between gap-4">
        <span className="text-blue-200 bg-yellow-800 px-1 rounded">
          {report[reportDate2]?.toDate().toLocaleDateString()}
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
          secondReports={secondReports}
        />
      )}
      <NavBar
        navBarColor={navBarColor}
        logoBGColor={logoBGColor}
        homeRedirect={homeRedirect}
      />
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
          {assignedRedirect && (
            <NavLink to={`${assignedRedirect}`} className={navClass}>
              Assigned
            </NavLink>
          )}
          <NavLink to={`${completedRedirect}`} end className={navClass}>
            Completed
          </NavLink>
          <NavLink to={`${overdueRedirect}`} className={navClass}>
            Overdue
          </NavLink>
        </div>
        <div className="w-full h-screen [scrollbar-width:none] [&::-webkit-scrollbar]:hidden  overflow-y-auto py-24 flex flex-col items-center z-0">
          {(user?.role === "admin" || user?.role === "estate") && (
            <button
              onClick={generateRegistrationID}
              className="bg-red-400 hover:bg-red-500 cursor-pointer transition text-white font-bold py-2 px-4 rounded my-4"
            >
              Generate Registration ID
            </button>
          )}

          <h1
            className={`text-xl border-y ${titleBorderColor} md:text-2xl ${primaryColor} font-bold w-full text-center py-2 ${secColor}`}
          >
            {title1}
          </h1>

          {firstReports.length > 0 ? (
            <div className="flex lg:max-w-[80%]  md:pl-[200px] gap-4 md:gap-10 justify-center w-full flex-wrap py-10 md:py-20 px-4">
              {firstReportsCard}
            </div>
          ) : (
            <p className=" my-20">Nothing to display here...yet</p>
          )}
          {!specificReportsPage && (
            <h1
              className={`text-xl hidden md:block md:text-2xl border-y ${titleBorderColor} ${primaryColor} font-bold w-full text-center py-2 ${secColor}`}
            >
              {title2}
            </h1>
          )}
          {secondReports.length > 0 && !specificReportsPage ? (
            <div className="flex lg:max-w-[80%]  md:pl-[200px] gap-4 md:gap-10 justify-center w-full flex-wrap py-10 md:py-20 px-4">
              {secondReportsCard}
            </div>
          ) : !specificReportsPage && secondReports.length <= 0 ? (
            <p className="hidden md:block my-20">
              Nothing to display here...yet
            </p>
          ) : (
            ""
          )}
        </div>
      </main>
    </>
  );
}
