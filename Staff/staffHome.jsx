import PageLayout from "./pageLayout";
import { useState } from "react";
import electricity from "../images/electricity.jpg";
import carpentry from "../images/carpentry.jpg";
import plumbing from "../images/plumbing.jpg";
import toolsIcon from "../images/toolsIcon.png";
import worker from "../images/worker.png";
import masonery from "../images/masonery.jpg";
import ac from "../images/ac.jpg";
import refrigerator from "../images/refrigerator.jpg";
import Footer from "../components/footer";
import ReportForm from "./reportForm";

export default function StaffHome() {
  const [sidePopup, setSidePopup] = useState(false);

  const services = [
    {
      name: "Electricity",
      provisions: ["Repairs", "Suplies"],
      image: electricity,
    },
    {
      name: "Plumbing",
      provisions: ["Repairs", "Suplies"],
      image: plumbing,
    },
    {
      name: "Carpentry",
      provisions: ["Repairs", "Suplies"],
      image: carpentry,
    },
    {
      name: "Masonery",
      provisions: ["Repairs", "Suplies"],
      image: masonery,
    },
    {
      name: "Refrigerator",
      provisions: ["Repairs"],
      image: refrigerator,
    },
    {
      name: "Air Conditioner",
      provisions: ["Repairs"],
      image: ac,
    },
  ];

  const serviceCard = services.map((service) => (
    <div
      className="flex flex-col items-center justify-center cursor-pointer rounded-xl border p-4 max-w-[130px] md:max-w-[300px]  w-full border-red-300 shadow"
      key={service.name}
    >
      <h1 className="text-xl mb-2 text-[[#111827]">{service.name}</h1>
      <div className="flex justify-center items-center gap-2">
        <span className="material-symbols-outlined">
          <span className="material-symbols-outlined">chevron_right</span>
        </span>
        <span>{service.provisions[0]}</span>
      </div>
      {service.provisions[1] && (
        <div className="flex justify-center items-center gap-2 mb-2">
          <span className="material-symbols-outlined">
            <span className="material-symbols-outlined">chevron_right</span>
          </span>
          <span className="text-lg">{service.provisions[1]}</span>
        </div>
      )}

      <img
        src={service.image}
        alt="service image"
        className="hidden rounded md:flex max-h-40 w-full"
      />
    </div>
  ));

  const systemWorkflows = [
    "You submit a maintenance report",
    "Report goes to administrator for approval",
    "Estate Manager receives report only upon admin approval",
    "Estate Manager makes a materials confirmation request to admin",
    "Admin confirms",
    "Estate Manager sends a materials request for procurement",
    "The work is assigned to appropriate technician",
    "Technician executes the task and updates progress",
    "You review completed work and provide feedback",
    "Admin, Estate manager and the assigned technician reviews feedback",
    "Further actions are taken if necessary",
  ];

  const systemWorkflowDiv = systemWorkflows.map((workflow) => (
    <div className="flex items-center gap-4 bg-red-300" key={workflow}>
      <img
        src={toolsIcon}
        alt="tools icon"
        className="w-12 h-12 bg-[#2563EB]"
      />
      <h2 className="md:text-lg px-2">{workflow}</h2>
    </div>
  ));

  const pageContent = (
    <main className="pt-20 md:pt-24 pb-20">
      <span
        className={`material-symbols-outlined md:hidden z-50 fixed cursor-pointer top-1/2 rounded-l-full py-2 pl-2 left-auto right-0 bg-red-400`}
        onClick={() => setSidePopup((prev) => !prev)}
      >
        {sidePopup ? "chevron_right" : "chevron_left"}
      </span>

      <div className="w-full mb-5 md:mb-10 text-center">
        <h1 className="text-2xl md:text-4xl md:mt-10 mt-4 text-[#2563EB]">
          Our Services
        </h1>
      </div>
      <div className="flex justify-center px-10 gap-5  flex-wrap mx-auto">
        {serviceCard}
      </div>
      <div className="flex flex-col md:mb-20 mt-20 md:mt-40 ">
        <h1 className="bg-[#2563EB] text-xl text-center py-4 md:2xl">
          System Workflow
        </h1>
        <div className="flex flex-col relative">
          {systemWorkflowDiv}
          <img
            src={worker}
            alt="cartoon image"
            className="absolute max-w-[500px] right-0 bottom-20 hidden lg:block"
          />
        </div>
      </div>

      <h1 className="text-center text-2xl md:4xl mt-10">Report Timelines</h1>
      <div className="flex justify-center flex-wrap gap-2 md:gap-10 md:gap-10 mb-10 mt-4 md:mt-10">
        <div className="w-full border border-[#2563EB] bg-red-300 rounded-2xl px-2 pb-2 max-w-[150px] md:max-w-[300px]">
          <h1 className="text-[#2563EB]  rounded-b-2xl text-2xl md:4xl text-center mb-2 md:mb-4">
            Emergency
          </h1>
          <p className="text-white">
            Reports with priority set to EMERGENCY will be attend to {""}
            {
              <span className="text-red-700 font-bold">
                as soon as possible
              </span>
            }
          </p>
        </div>

        <div className="w-full border border-[#2563EB] bg-red-300 rounded-2xl px-2 pb-2 max-w-[150px] md:max-w-[300px]">
          <h1 className="text-[#2563EB]  rounded-b-2xl text-2xl md:4xl text-center mb-2 md:mb-4">
            Urgent
          </h1>
          <p className="text-white">
            Reports with priority set to URGENT will be attend to within a
            period of {<span className="text-red-700 font-bold">12 hrs</span>}
          </p>
        </div>

        <div className="w-full border border-[#2563EB] bg-red-300 rounded-2xl px-2 pb-2 max-w-[150px] md:max-w-[300px]">
          <h1 className="text-[#2563EB] bg-red-300 rounded-b-2xl text-2xl md:4xl text-center mb-2 md:mb-4">
            Routine
          </h1>
          <p className="text-white">
            Reports with priority set to ROUTINE will be attend to within a
            period of{" "}
            {<span className="text-red-700 font-bold">1 to 2 days</span>}
          </p>
        </div>
      </div>

      <div className="bg-red-700 py-2 md:py-10">
        <h1 className="text-white text-center mb-4 font-bold">
          IMPORTANT NOTICE
        </h1>
        <p className="px-4 text-yellow-500 lg:px-60">
          The urgency of a report will depend on the intensity of the issue at
          hand. Merely setting a report priority as emergency or urgent doesn't
          make it an emergency or urgent report.
        </p>
      </div>

      <div className="w-full">
        <h1 className="text-center text-2xl md:4xl mt-10 mb-2">
          Working Hours
        </h1>
        <p className="text-red-400 bg-black text-center py-2">
          Monday to Friday from {<span className="font-bold">8am to 4pm</span>}
        </p>
      </div>
    </main>
  );

  return <PageLayout content={pageContent} sidePopup={sidePopup} page="Home" />;
}
