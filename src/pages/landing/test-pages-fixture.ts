/**
 * Shared test fixture: the five landing pages as runtime content.
 *
 * Captured from the Content_Repo page.json files when the compiled registry
 * (site/pages/) was removed in landing-page-editor stage 4, so the route and
 * navigation tests still have the real page content to assert against without
 * importing a registry that no longer exists. If a landing page is edited, this
 * fixture may need regenerating; it is test data, not a second source of truth.
 */

import type { LandingPage } from "../../lib/page-schema";

export const TEST_PAGES: LandingPage[] = [
  {
    schemaVersion: 1,
    slug: "about",
    nav: {
      label: "About Me",
      order: 1,
    },
    seo: {
      title: "About Me",
      description: "Software developer and online educator.",
    },
    header: {
      title: "About Me",
      description: "Software developer, educator, and technologist",
      divider: true,
    },
    blocks: [
      {
        id: "background",
        type: "columns",
        version: 1,
        columns: [
          {
            title: "Background",
            markdown:
              "Results-driven technologist and engineer with over 15 years of leadership experience delivering mission-critical solutions across the U.S. public sector. Proven track record leading large-scale modernization efforts for federal agencies through cloud transformation, DevSecOps adoption, agile delivery, and enterprise architecture.\n\nSkilled in managing multimillion-dollar programs and cross-functional engineering teams of 40+ professionals, with a focus on operational excellence, security compliance, and scalable technology solutions. A trusted advisor in both technical and strategic contexts, driving measurable business outcomes in complex, federal environments.",
          },
          {
            title: "This Site",
            markdown:
              "The carnaghan.com domain started its life in 1999 when I initially registered it in the hope of learning how to build my own web page. For many years this site was left dormant. It wasn't until 2011 I started actively using it as a blog.\n\nToday I use this as a space primarily for writing about current topics and concepts within web development, DevOps, cloud, AI, and other tech fields. This site is a mix of articles, tutorials, lessons learned, and the occasional academic paper.",
          },
        ],
      },
      {
        id: "skills",
        type: "badge-list",
        version: 1,
        title: "Skills & Technologies",
        tone: "neutral",
        items: [
          "Cloud Architecture",
          "DevSecOps",
          "Agile Delivery",
          "Enterprise Architecture",
          "Python",
          "JavaScript",
          "TypeScript",
          "React",
          "AWS",
          "Kubernetes",
          "Docker",
          "CI/CD",
          "Drupal",
          "WordPress",
          "ColdFusion",
          "PHP",
        ],
      },
      {
        id: "doctoral-research",
        type: "panel",
        version: 1,
        title: "Doctoral Research",
        lead: "An Expeditionary Learning Approach to Effective Curriculum Mapping: Formalizing the Process by Exploring a User-Centered Framework",
        markdown:
          "Monarch Academy is an Expeditionary Learning institution which utilizes a non-traditional educational model that combines all subjects into semester-long projects known as expeditions. This study explores and defines a curriculum mapping solution that meets Monarch Academy's needs by providing a centralized, accessible, manageable, and user-centered framework.",
      },
      {
        id: "connect",
        type: "social-links",
        version: 1,
        title: "Connect",
      },
    ],
  },
  {
    schemaVersion: 1,
    slug: "apps",
    nav: {
      label: "Apps",
      order: 2,
    },
    seo: {
      title: "Apps",
      description:
        "Small, focused applications built on AWS — a rental-tax app, a personal WireGuard VPN, and a Minecraft server manager.",
    },
    header: {
      title: "Apps",
      description: "Small, focused applications I've built — mostly to solve a problem of my own.",
    },
    blocks: [
      {
        id: "intro",
        type: "prose",
        version: 1,
        markdown:
          "Each of these started as something I actually needed, then became an excuse to build it properly on AWS. Every app has a write-up covering the design decisions and what I'd do differently, and the source is on GitHub.",
      },
      {
        id: "apps",
        type: "card-grid",
        version: 1,
        tone: "neutral",
        columns: 2,
        emptyText: "No apps listed yet.",
        items: [
          {
            id: "logstead",
            badge: {
              text: "Finance",
            },
            title: "Logstead",
            description:
              "Prepares an IRS Schedule E rental return from logged income and expenses. Produces year-end totals, straight-line depreciation, and per-property reports, so the numbers are ready to file rather than scattered across spreadsheets.",
            tags: ["React", "AWS", "Serverless", "Kiro"],
            actions: [
              {
                label: "Read the write-up",
                to: "/building-logstead-a-schedule-e-rental-tax-app-with-aws-and-kiro",
                primary: true,
              },
              {
                label: "Source",
                href: "https://github.com/icarnaghan/logstead",
              },
            ],
          },
          {
            id: "personal-aws-vpn",
            badge: {
              text: "Networking",
            },
            title: "Personal AWS VPN",
            description:
              "A config-driven personal VPN running on your own AWS account using WireGuard. Cheaper than a commercial subscription, with full control over where the exit node lives and who can connect.",
            tags: ["WireGuard", "CDK Python", "AWS", "Kiro"],
            actions: [
              {
                label: "Read the write-up",
                to: "/building-a-personal-aws-vpn-with-wireguard-and-kiro",
                primary: true,
              },
              {
                label: "Source",
                href: "https://github.com/icarnaghan/Wireguard-VPN",
              },
            ],
          },
          {
            id: "minecraft-server-manager",
            badge: {
              text: "Infrastructure",
            },
            title: "Minecraft Server Manager",
            description:
              "Turns a single Minecraft server into a managed platform — provisioning, lifecycle control, and monitoring behind a web front end, so a server can be started, stopped, and maintained without touching the console.",
            tags: ["React", "CDK", "AWS", "Kiro"],
            actions: [
              {
                label: "Read the write-up",
                to: "/building-an-enterprise-minecraft-server-manager-with-aws-and-kiro",
                primary: true,
              },
              {
                label: "Source",
                href: "https://github.com/icarnaghan/minecraft-server",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    schemaVersion: 1,
    slug: "teaching",
    nav: {
      label: "Teaching",
      order: 3,
    },
    seo: {
      title: "Teaching",
      description: "University courses and teaching materials.",
    },
    header: {
      title: "Classes I Teach",
      description: "I've been teaching at the University of Maryland Global Campus since 2007.",
    },
    blocks: [
      {
        id: "intro",
        type: "prose",
        version: 1,
        markdown:
          "Below are the classes I am currently teaching or have taught in previous semesters. See my supporting videos, code and other content I have created to supplement each course. For more details including schedule and syllabus see the official [UMGC Schedule of Classes](https://webapps.umgc.edu/soc/us.cfm).",
      },
      {
        id: "current",
        type: "card-grid",
        version: 1,
        title: "Current Courses",
        tone: "active",
        columns: 2,
        items: [
          {
            id: "cmst-387",
            badge: {
              text: "CMST 387",
              tagFilter: "cmst-387",
            },
            title: "Principles of Web Design and Technology III",
            meta: "3 Credits",
            description:
              "A comprehensive, project-focused exploration of the techniques, tools, workflows, and industry best practices used in advanced web development. Topics include web security, accessibility, inclusive design, and web performance optimization.",
            actions: [
              {
                label: "Videos",
                href: "https://www.youtube.com/playlist?list=PLstLbm0RKNISjebURDKkP_yU-uCRzYVS4",
              },
            ],
          },
          {
            id: "cmst-388",
            badge: {
              text: "CMST 388",
              tagFilter: "cmst-388",
            },
            title: "Fundamentals of JavaScript",
            meta: "3 Credits",
            description:
              "A hands-on, project-based study of JavaScript using a structured programming approach to build dynamic, interactive web pages. Topics include form validation, dynamic HTML, event handling, cross-browser compatibility, cookies, and security issues.",
            actions: [
              {
                label: "Project Tips",
                to: "/teaching/cmst388-tips",
                primary: true,
              },
              {
                label: "GitHub Code",
                href: "https://github.com/topics/cmst-388",
              },
            ],
          },
        ],
      },
      {
        id: "previous",
        type: "card-grid",
        version: 1,
        title: "Previous Courses",
        tone: "neutral",
        columns: 2,
        items: [
          {
            id: "cmst-315",
            badge: {
              text: "CMST 315",
              tagFilter: "cmst-315",
            },
            title: "Game Design",
            meta: "3 Credits",
            description:
              "A hands-on, project-based introduction to 3D video game design and programming fundamentals. The aim is to use an industry-standard 3D game engine to create a game from concept to final product.  Topics include 3D game engines, 3D game design, gameplay mechanics, sound effects, C# programming, project management, 3D physics and user interface design.",
          },
          {
            id: "cmst-488",
            badge: {
              text: "CMST 488",
              tagFilter: "cmst-488",
            },
            title: "Advanced JavaScript",
            meta: "3 Credits",
            description:
              "A hands-on, project-based study of web application development using advanced JavaScript technologies. Topics include JavaScript libraries, user interfaces, accessibility, usability, and security.",
            actions: [
              {
                label: "Videos",
                href: "https://www.youtube.com/playlist?list=PLstLbm0RKNISoBiu51y1qY0EcQY1lNCdQ",
              },
              {
                label: "GitHub Code",
                href: "https://github.com/topics/cmst-488",
              },
            ],
          },
          {
            id: "cmst-386",
            badge: {
              text: "CMST 386",
              tagFilter: "cmst-386",
            },
            title: "Principles of Web Design and Technology II",
            meta: "3 Credits",
            description:
              "Continuation of the study of web design, tools, and technology principles. Focus is on XHTML, CSS, and JavaScript with topics including website marketing, web analytics, performance, privacy, and security.",
            actions: [
              {
                label: "Videos",
                href: "https://www.youtube.com/watch?v=puxJYv5BN2M",
              },
            ],
          },
          {
            id: "cmst-385",
            badge: {
              text: "CMST 385",
              tagFilter: "cmst-385",
            },
            title: "Principles of Web Design and Technology I",
            meta: "3 Credits",
            description:
              "A study of web design, tools and technology principles. Topics include Internet protocols, usability, accessibility, and social, ethical, and legal issues related to website production. Focus is on XHTML and CSS.",
            actions: [
              {
                label: "Videos",
                href: "https://www.youtube.com/watch?v=puxJYv5BN2M",
              },
            ],
          },
          {
            id: "cmst-303",
            badge: {
              text: "CMST 303",
              tagFilter: "cmst-303",
            },
            title: "Advanced Application Software",
            meta: "3 Credits",
            description:
              "A hands-on, project-based survey of advanced features of office application software. Topics include information systems, application integration, computer hardware and software, storage, and networking.",
          },
          {
            id: "cmst-301",
            badge: {
              text: "CMST 301",
              tagFilter: "cmst-301",
            },
            title: "Digital Media and Society",
            meta: "3 Credits",
            description:
              "A survey of technological advancements in digital media and their impact. Topics include social media, the visual display of information, ethics and privacy, participatory media, and the impact of digital media on culture.",
          },
          {
            id: "cmst-355",
            badge: {
              text: "CMST 355",
              tagFilter: "cmst-355",
            },
            title: "Content Management Systems",
            meta: "3 Credits",
            description:
              "A hands-on, project-based introduction to website development using content management systems (CMS). The goal is to use CMSs to quickly create engaging, interactive, and dynamic websites following industry-standard best practices. Topics include content publishing workflows, cross-browser compatibility, security and privacy vulnerabilities, plug-ins, themes, and templates.",
            actions: [
              {
                label: "Videos",
                href: "https://www.youtube.com/watch?v=todJktIBCTI",
              },
            ],
          },
        ],
      },
    ],
  },
  {
    schemaVersion: 1,
    slug: "bitesize-javascript",
    nav: {
      label: "Bitesize JavaScript",
      order: 4,
    },
    seo: {
      title: "Bitesize JavaScript",
      description: "Short JavaScript lessons and examples.",
    },
    header: {
      title: "Bitesize JavaScript",
    },
    blocks: [
      {
        id: "intro",
        type: "prose",
        version: 1,
        muted: true,
        markdown:
          "Bitesize JavaScript is a series of short lessons covering fundamental coding concepts. The goal is to quickly introduce you to the language and provide you with enough information to begin exploring the concepts in more depth. Each lesson is designed to take a short amount of time to digest new topics and then apply them through example.",
      },
      {
        id: "lessons",
        type: "card-grid",
        version: 1,
        tone: "neutral",
        columns: 2,
        items: [
          {
            id: "javascript-data-types-values-and-variables",
            badge: {
              text: "1",
            },
            title: "JavaScript Data Types, Values, and Variables",
            titleLink: {
              to: "/javascript-data-types-values-and-variables",
            },
            description:
              "An introduction to core JavaScript concepts including variables, data types, and how information is stored and retrieved in memory.",
          },
          {
            id: "javascript-operators",
            badge: {
              text: "2",
            },
            title: "JavaScript Operators",
            titleLink: {
              to: "/javascript-operators",
            },
            description:
              "Explore the different kinds of operators in JavaScript that enable you to perform actions on values and variables, including statements and expressions.",
          },
          {
            id: "javascript-conditional-statements",
            badge: {
              text: "3",
            },
            title: "JavaScript Conditional Statements",
            titleLink: {
              to: "/javascript-conditional-statements",
            },
            description:
              "Learn how JavaScript makes decisions using if statements, conditions, and code blocks to run specified code based on criteria.",
          },
          {
            id: "javascript-loops",
            badge: {
              text: "4",
            },
            title: "JavaScript Loops",
            titleLink: {
              to: "/javascript-loops",
            },
            description:
              "Reduce redundant code with while, do while, and for loops to quickly offload repetitive tasks to the computer.",
          },
          {
            id: "javascript-functions",
            badge: {
              text: "5",
            },
            title: "JavaScript Functions",
            titleLink: {
              to: "/javascript-functions",
            },
            description:
              "Functions are repeatable blocks of code that allow you to build applications with reusable code that can be called with different arguments.",
          },
          {
            id: "javascript-call-stack",
            badge: {
              text: "6",
            },
            title: "JavaScript Call Stack",
            titleLink: {
              to: "/javascript-call-stack",
            },
            description:
              "Understand the flow of execution in your code through the call stack, a data structure that tracks function calls using Last In First Out ordering.",
          },
          {
            id: "javascript-scope",
            badge: {
              text: "7",
            },
            title: "JavaScript Scope",
            titleLink: {
              to: "/javascript-scope",
            },
            description:
              "Scope determines what variables are available to JavaScript within its current context, from global variables to lexical scope.",
          },
          {
            id: "javascript-arrays-fundamentals",
            badge: {
              text: "8",
            },
            title: "JavaScript Arrays - Fundamentals",
            titleLink: {
              to: "/javascript-arrays-fundamentals",
            },
            description:
              "Arrays let you group values within a data structure and offer methods to update and manipulate their contents.",
          },
          {
            id: "javascript-arrays-properties-and-methods",
            badge: {
              text: "9",
            },
            title: "JavaScript Arrays - Properties and Methods",
            titleLink: {
              to: "/javascript-arrays-properties-and-methods",
            },
            description:
              "Cover the most commonly used properties and methods for working with arrays, from length to push, pop, and beyond.",
          },
          {
            id: "javascript-objects",
            badge: {
              text: "10",
            },
            title: "JavaScript Objects",
            titleLink: {
              to: "/javascript-objects",
            },
            description:
              "Objects expand on arrays with key-value pairs, giving you greater control over how you organize and categorize data.",
          },
          {
            id: "javascript-manipulating-the-document-object-model-dom",
            badge: {
              text: "11",
            },
            title: "Manipulating the Document Object Model (DOM)",
            titleLink: {
              to: "/javascript-manipulating-the-document-object-model-dom",
            },
            description:
              "Learn how to access and manipulate the logical structure of HTML documents programmatically using the DOM.",
          },
        ],
      },
      {
        id: "other-tutorials",
        type: "card-grid",
        version: 1,
        title: "Other JavaScript Tutorials",
        columns: 2,
        items: [
          {
            id: "understanding-asynchronous-javascript",
            title: "Understanding Asynchronous JavaScript",
            titleLink: {
              to: "/understanding-asynchronous-javascript",
            },
            description:
              "Explore callbacks, promises, and async/await to handle asynchronous operations in JavaScript.",
          },
          {
            id: "understanding-higher-order-functions-in-javascript",
            title: "Understanding Higher Order Functions in JavaScript",
            titleLink: {
              to: "/understanding-higher-order-functions-in-javascript",
            },
            description:
              "Learn how functions that take or return other functions unlock powerful patterns like map, filter, and reduce.",
          },
          {
            id: "creating-a-super-simple-javascript-validated-form",
            title: "Creating a Super Simple JavaScript Validated Form",
            titleLink: {
              to: "/creating-a-super-simple-javascript-validated-form",
            },
            description: "Build a basic form with client-side validation using vanilla JavaScript.",
          },
          {
            id: "regular-expressions-in-javascript",
            title: "Regular Expressions in JavaScript",
            titleLink: {
              to: "/regular-expressions-in-javascript",
            },
            description:
              "A practical guide to pattern matching and text manipulation with regex in JavaScript.",
          },
          {
            id: "important-features-of-es6",
            title: "Important Features of ES6",
            titleLink: {
              to: "/important-features-of-es6",
            },
            description:
              "An overview of key ES6 features including arrow functions, template literals, destructuring, and more.",
          },
          {
            id: "javascript-closures",
            title: "JavaScript Closures",
            titleLink: {
              to: "/javascript-closures",
            },
            description:
              "Understand how inner functions retain access to outer function variables through the scope chain.",
          },
        ],
      },
    ],
  },
  {
    schemaVersion: 1,
    slug: "teaching/cmst388-tips",
    seo: {
      title: "CMST 388 Project Tips",
      description: "Tips and guidance for CMST 388 projects.",
    },
    header: {
      title: "CMST 388 Project Tips",
      description: "Tips and guidance for CMST 388 projects",
    },
    breadcrumbs: [
      {
        text: "Home",
        to: "/",
      },
      {
        text: "Teaching",
        to: "/teaching",
      },
      {
        text: "CMST 388 Project Tips",
      },
    ],
    blocks: [
      {
        id: "projects",
        type: "card-grid",
        version: 1,
        columns: 3,
        items: [
          {
            id: "project-1-javascript-selectors",
            title: "Project 1: JavaScript Selectors",
            titleLink: {
              to: "/teaching/cmst388-tips/project-1-javascript-selectors",
            },
            description:
              "Tips for working with DOM selectors including getElementById, querySelector, and querySelectorAll. Covers selecting, modifying, and styling elements.",
          },
          {
            id: "project-3-ticket-purchasing",
            title: "Project 3: Ticket Purchasing",
            titleLink: {
              to: "/teaching/cmst388-tips/project-3-ticket-purchasing",
            },
            description:
              "Guidance on building a ticket purchasing form with JavaScript. Covers event handling, form validation, calculations, and dynamic UI updates.",
          },
          {
            id: "project-4-student-portfolio",
            title: "Project 4: Student Portfolio",
            titleLink: {
              to: "/teaching/cmst388-tips/project-4-student-portfolio",
            },
            description:
              "Tips for building a student portfolio site. Covers page structure, navigation, responsive design, and JavaScript interactivity.",
          },
        ],
      },
      {
        id: "additional-resources",
        type: "prose",
        version: 1,
        title: "Additional Resources",
        muted: true,
        markdown:
          "A few years ago I wrote a blog series called [Bitesize JavaScript](/bitesize-javascript) also linked in the main menu above. These are small bitesize chunk lessons that you should be able to complete in 30 - 60 minutes each and provide practice needed for mastering fundamental JavaScript skills. Each lesson has accompanying code samples you can reuse and build on as you master these topics. I wrote these primarily for my CMST 388 & CMST 488 classes at the time, however they can be used as a quick reference for any related JavaScript classes or projects.\n\nIn addition to the above, I also have a blog post called [Creating a Super Simple JavaScript Validated Form](/creating-a-super-simple-javascript-validated-form/), which should be a helpful resource for Project 2.",
      },
    ],
  },
] as LandingPage[];

export const TEST_PAGES_MANIFEST = [
  {
    slug: "about",
    nav: {
      label: "About Me",
      order: 1,
    },
    seo: {
      title: "About Me",
      description: "Software developer and online educator.",
    },
  },
  {
    slug: "apps",
    nav: {
      label: "Apps",
      order: 2,
    },
    seo: {
      title: "Apps",
      description:
        "Small, focused applications built on AWS — a rental-tax app, a personal WireGuard VPN, and a Minecraft server manager.",
    },
  },
  {
    slug: "teaching",
    nav: {
      label: "Teaching",
      order: 3,
    },
    seo: {
      title: "Teaching",
      description: "University courses and teaching materials.",
    },
  },
  {
    slug: "bitesize-javascript",
    nav: {
      label: "Bitesize JavaScript",
      order: 4,
    },
    seo: {
      title: "Bitesize JavaScript",
      description: "Short JavaScript lessons and examples.",
    },
  },
  {
    slug: "teaching/cmst388-tips",
    seo: {
      title: "CMST 388 Project Tips",
      description: "Tips and guidance for CMST 388 projects.",
    },
  },
];
