import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signInAnonymously, // Added: Anonymous Login
  GoogleAuthProvider,
  GithubAuthProvider,
  OAuthProvider,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
  updateProfile
} from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';

// --- Icons (Inline SVGs) ---
const IconBase = ({ children, className = "w-6 h-6", ...props }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    {...props}
  >
    {children}
  </svg>
);

const Activity = (props) => <IconBase {...props}><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></IconBase>;
const ArrowLeft = (props) => <IconBase {...props}><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></IconBase>;
const ArrowRight = (props) => <IconBase {...props}><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></IconBase>;
const Copy = (props) => <IconBase {...props}><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></IconBase>;
const DoorOpen = (props) => <IconBase {...props}><path d="M13 4h3a2 2 0 0 1 2 2v14" /><path d="M2 20h3" /><path d="M13 20h9" /><path d="M10 12v.01" /><path d="M13 4.562v16.157a1 1 0 0 1-1.242.97L5 20V5.562a2 2 0 0 1 1.515-1.94l4-1A2 2 0 0 1 13 4.561Z" /></IconBase>;
const FolderPlus = (props) => <IconBase {...props}><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 2H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" /><line x1="12" x2="12" y1="10" y2="16" /><line x1="9" x2="15" y1="13" y2="13" /></IconBase>;
const Lock = (props) => <IconBase {...props}><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></IconBase>;
const LogOut = (props) => <IconBase {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></IconBase>;
const Plus = (props) => <IconBase {...props}><path d="M5 12h14" /><path d="M12 5v14" /></IconBase>;
const Search = (props) => <IconBase {...props}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></IconBase>;
const Trash2 = (props) => <IconBase {...props}><path d="M3 6h18" /><path d="M19 6v14c0 1 1 2 2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></IconBase>;
const Trophy = (props) => <IconBase {...props}><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" /><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" /><path d="M4 22h16" /><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" /><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" /><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" /></IconBase>;
const Unlock = (props) => <IconBase {...props}><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></IconBase>;
const UserPlus = (props) => <IconBase {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><line x1="19" x2="19" y1="8" y2="14" /><line x1="22" x2="16" y1="11" y2="11" /></IconBase>;
const Users = (props) => <IconBase {...props}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></IconBase>;
const Vote = (props) => <IconBase {...props}><rect width="18" height="18" x="3" y="3" rx="2" /><path d="m9 12 2 2 4-4" /></IconBase>;
const Dices = (props) => <IconBase {...props}><rect width="12" height="12" x="2" y="10" rx="2" ry="2" /><path d="m17.92 14 3.5-3.5a2.24 2.24 0 0 0 0-3l-5-4.92a2.24 2.24 0 0 0-3 0L10 6" /><path d="M6 18h.01" /><path d="M10 14h.01" /><path d="M15 6h.01" /><path d="M18 9h.01" /></IconBase>;
const Crown = (props) => <IconBase {...props}><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" /></IconBase>;
const Key = (props) => <IconBase {...props}><path d="m21 2-2 2m-7.6 7.6a6.5 6.5 0 1 1-9.2 7.8 6.5 6.5 0 0 1 9.2-7.8zm0 0 3.8-3.8m-5.5 5.5 2.1 2.1" /></IconBase>;
const X = (props) => <IconBase {...props}><path d="M18 6 6 18" /><path d="m6 6 18 18" /></IconBase>;
const ChartLine = (props) => <IconBase {...props}><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></IconBase>;
const Flag = (props) => <IconBase {...props}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><line x1="4" x2="4" y1="22" y2="15" /></IconBase>;
const Github = (props) => <IconBase {...props}><path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" /><path d="M9 18c-4.51 2-5-2-7-2" /></IconBase>;
const Mail = (props) => <IconBase {...props}><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></IconBase>;
const Chrome = (props) => <IconBase {...props}><circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" /><line x1="21.17" x2="12" y1="8" y2="8" /><line x1="3.95" x2="8.54" y1="6.06" y2="14" /><line x1="10.88" x2="15.46" y1="21.94" y2="14" /></IconBase>;
const AppWindow = (props) => <IconBase {...props}><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M10 4v4" /><path d="M2 8h20" /><path d="M6 4v4" /></IconBase>;
const User = (props) => <IconBase {...props}><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></IconBase>;
const Shield = (props) => <IconBase {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></IconBase>;
const Database = (props) => <IconBase {...props}><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" /><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" /></IconBase>;
const Info = (props) => <IconBase {...props}><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="16" y2="12" /><line x1="12" x2="12.01" y1="8" y2="8" /></IconBase>;

// --- Real Brand Icons ---
const GoogleIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.24-1.19-.6z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </svg>
);

const MicrosoftIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 23 23" xmlns="http://www.w3.org/2000/svg">
    <path fill="#f35325" d="M1 1h10v10H1z" />
    <path fill="#81bc06" d="M12 1h10v10H12z" />
    <path fill="#05a6f0" d="M1 12h10v10H1z" />
    <path fill="#ffba08" d="M12 12h10v10H12z" />
  </svg>
);

const GithubIcon = ({ className }) => (
  <svg className={className} viewBox="0 0 98 96" xmlns="http://www.w3.org/2000/svg">
    <path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.062 7.523 5.062 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" fill="#181717" />
  </svg>
);

// --- Component: Brand Logo ---
const AtmostfairLogo = ({ className = "text-3xl" }) => (
  <span className={`${className} font-display font-medium tracking-tight select-none`}>
    <span className="text-google-blue">a</span>
    <span className="text-google-red">t</span>
    <span className="text-google-yellow">m</span>
    <span className="text-google-blue">o</span>
    <span className="text-google-green">s</span>
    <span className="text-google-red">t</span>
    <span className="text-google-blue">f</span>
    <span className="text-google-red">a</span>
    <span className="text-google-yellow">i</span>
    <span className="text-google-blue">r</span>
  </span>
);

// --- Firebase Config ---
// ⚠️ 重要：请在此处填入你在 Firebase 控制台获取的真实配置
const firebaseConfig = {
  apiKey: "AIzaSyBFHzDuk-Bg0yuFYyV4SufErk0Aju_dUzo",
  authDomain: "atmostfair-84a15.firebaseapp.com",
  projectId: "atmostfair-84a15",
  storageBucket: "atmostfair-84a15.firebasestorage.app",
  messagingSenderId: "309487876744",
  appId: "1:309487876744:web:38356149523ad912e63d3d",
  measurementId: "G-1NPB3HRW5E"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- Translations ---
const TRANSLATIONS = {
  en: {
    // Language Switcher
    switchLang: "中文",
    // Auth
    signIn: "Sign in",
    continueTo: "to continue to Atmostfair",
    emailAddr: "Email address",
    password: "Password",
    processing: "Processing...",
    loginReg: "Login / Register",
    guestName: "Guest Name",
    guestLogin: "Guest Login",
    or: "Or",
    magicLink: "Verify Login (No Password)",
    magicLinkInfo: "Login link sent to your email.",
    magicLinkError: "Magic Link failed",
    magicLinkPrompt: "Please enter your email again for verification:",
    enterEmail: "Please enter email to receive magic link",
    googleLogin: "Sign in with Google",
    githubLogin: "Sign in with GitHub",
    microsoftLogin: "Sign in with Microsoft",
    passwordError: "Incorrect password",
    setGuestName: "Please set a guest nickname",
    // Nav
    adminConsole: "Admin Console",
    logout: "Logout",
    hello: "Hello",
    loading: "Loading...",
    // Home
    searchPlaceholder: "Search {label} projects...",
    searchDefault: "Search projects...",
    newProject: "New Project",
    closeCreator: "Close Creator",
    create: "Create",
    lockTitle: "Password Required",
    verifyAccess: "Verify to access project",
    unlock: "Unlock",
    cancel: "Cancel",
    incorrectPass: "Incorrect password",
    noProjects: "No active projects found",
    enterPassword: "Enter password",
    // Tabs
    collect: "Collect",
    connect: "Connect",
    select: "Select",
    // Create
    createTitle: "Create New {type} Project",
    selectTool: "Select Tool Type",
    moreComing: "More tools coming soon...",
    projTitle: "Project Title",
    projTitlePlaceholder: "e.g., Weekly Team Lunch",
    creatorName: "Your Name (as Creator)",
    creatorNamePlaceholder: "Creator Name",
    accessPass: "Access Password (Optional)",
    leaveEmpty: "Leave empty for public",
    createBtn: "Create {label} Project",
    collectInfo: "Create polls and voting campaigns, support real-time stats and sorting.",
    connectInfo: "Create team lobbies for hackathons or gaming squads.",
    selectInfo: "Create fair roulette wheels with verifiable random results.",
    privateInfo: "Set a password to make the project private.",
    // Cards
    finished: "Finished",
    paused: "Paused",
    // Voting Module
    voting: "Voting",
    votingDesc: "Real-time polls & ranked choices",
    // Teams Module
    teams: "Teams",
    teamsDesc: "Group formation & squad building",
    // Roulette Module
    roulette: "Roulette",
    rouletteDesc: "Fair random picker & lottery",
    // Detail View
    backToDash: "Back to Dashboard",
    resume: "Resume",
    pause: "Pause",
    delete: "Delete",
    deleteProject: "Delete Project",
    deleteConfirm: "Delete project?",
    // Voting View
    addItemPlaceholder: "Add a new option...",
    yourNamePlaceholder: "Your Name",
    add: "Add",
    votes: "votes",
    addedBy: "Added by",
    votingHelpTitle: "How to use Voting",
    votingHelpSteps: [
      "Enter option name and click Add.",
      "Click trophy icon to vote.",
      "Most voted options rise to top.",
      "Only creator/admin can delete."
    ],
    // Team View
    currentTeam: "Current Team",
    disbandTeam: "Disband Team",
    leave: "Leave",
    leader: "Leader",
    teamNamePlaceholder: "Team Name",
    yourNicknamePlaceholder: "Your Nickname",
    createTeam: "Create Team",
    joinTeam: "Join Team",
    fullOrClosed: "Full or Closed",
    teamHelpTitle: "Team Rules",
    teamHelpSteps: [
      "Enter name to create team (limit 4).",
      "Click Join Team to join.",
      "Leader can kick or disband.",
      "Locked when paused/finished."
    ],
    // Roulette View
    confirmSelection: "Confirm Selection",
    spinMessage: "Are you sure you want to spin the wheel?",
    confirmSpin: "Confirm & Spin",
    winnerAnnounced: "Winner Announced",
    index: "Index",
    sum: "Sum",
    fairRoulette: "Fair Roulette",
    total: "Total",
    people: "People",
    result: "Result",
    drawWinner: "Draw Winner",
    joinToPlay: "Join to Play",
    rouletteCannotChange: "Choose a number. Once submitted, it ",
    cannotBeChanged: "cannot be changed",
    entryNamePlaceholder: "Entry Name",
    valueLabel: "Value (0-100)",
    submitEntry: "Submit Entry",
    participants: "Participants",
    distributionChart: "Distribution Chart",
    availAfterResults: "Available after results",
    notEnoughData: "Not enough data to display",
    rouletteHelpTitle: "Fair Roulette Rules",
    rouletteHelpSteps: [
      "Submit name and value (0-100).",
      "Sum of values determines winner.",
      "Winner Index = Sum % Total Participants.",
      "Verifiably fair and random."
    ],
    // Admin
    adminTitle: "Admin Console",
    exitAdmin: "Exit Console",
    totalProjects: "Total Projects",
    items: "Items",
    cleanOrphans: "Clean Orphan Data",
    orphanDetected: "Detected: {items} items, {rooms} rooms, {participants} participants.",
    forceDelete: "Force Delete",
    orphanConfirm: "Confirm cleanup?",
    orphanSuccess: "Cleanup complete!",
    orphanError: "Cleanup failed: ",
    projectDeleteConfirm: "Confirm delete project \"{title}\"?",
    allProjectsManager: "All Projects Manager",
    sortedByDate: "Sorted by creation date",
    creators: "Creators",
    orphanNote: "These data IDs no longer exist in the projects database.",
    dbEmpty: "Database is empty"
  },
  zh: {
    // Language Switcher
    switchLang: "English",
    // Auth
    signIn: "登录",
    continueTo: "继续进入 Atmostfair",
    emailAddr: "邮箱地址",
    password: "密码",
    processing: "处理中...",
    loginReg: "登录 / 注册",
    guestName: "访客昵称",
    guestLogin: "访客进入",
    or: "或",
    magicLink: "验证登录 (无密码)",
    magicLinkInfo: "登录验证链接已发送到您的邮箱，请查收并点击链接登录。",
    magicLinkError: "发送链接失败: ",
    magicLinkPrompt: "请再次输入您的邮箱以完成验证：",
    enterEmail: "请填写邮箱以接收登录验证链接",
    googleLogin: "使用 Google 登录",
    githubLogin: "使用 GitHub 登录",
    microsoftLogin: "使用 Microsoft 登录",
    passwordError: "密码错误",
    setGuestName: "请设置一个访客昵称",
    // Nav
    adminConsole: "管理控制台",
    logout: "退出",
    hello: "你好",
    loading: "加载中...",
    // Home
    searchPlaceholder: "搜索 {label} 项目...",
    searchDefault: "搜索项目...",
    newProject: "新建项目",
    closeCreator: "关闭创建",
    create: "创建",
    lockTitle: "需要密码",
    verifyAccess: "请输入密码以访问",
    unlock: "解锁",
    cancel: "取消",
    incorrectPass: "密码错误",
    noProjects: "没有找到活跃项目",
    enterPassword: "输入密码",
    // Tabs
    collect: "收集",
    connect: "连接",
    select: "选择",
    // Create
    createTitle: "创建新的 {type} 项目",
    selectTool: "选择工具类型",
    moreComing: "更多工具敬请期待...",
    projTitle: "项目标题",
    projTitlePlaceholder: "例如：周五组队午餐",
    creatorName: "你的名字 (作为创建者)",
    creatorNamePlaceholder: "创建者名字",
    accessPass: "访问密码 (可选)",
    leaveEmpty: "留空则公开",
    createBtn: "创建 {label} 项目",
    collectInfo: "创建简单易用的投票活动，支持实时统计和结果排序。",
    connectInfo: "创建组队大厅，让成员自由创建或加入小队，适合黑客松或游戏组队。",
    selectInfo: "创建绝对公平的随机轮盘，算法透明，结果不可人为干预。",
    privateInfo: "设置访问密码可将项目设为私有，只有知晓密码的用户才能进入。",
    // Cards
    finished: "已结束",
    paused: "已暂停",
    // Voting Module
    voting: "投票 (Voting)",
    votingDesc: "实时投票与排序选择",
    // Teams Module
    teams: "组队 (Teams)",
    teamsDesc: "小组对抗与队伍大厅",
    // Roulette Module
    roulette: "轮盘 (Roulette)",
    rouletteDesc: "公平随机抽奖与博弈",
    // Detail View
    backToDash: "返回仪表盘",
    resume: "恢复",
    pause: "暂停",
    delete: "删除",
    deleteProject: "删除项目",
    deleteConfirm: "确定删除项目吗？",
    // Voting View
    addItemPlaceholder: "添加新选项...",
    yourNamePlaceholder: "你的名字",
    add: "添加",
    votes: "票",
    addedBy: "添加者",
    votingHelpTitle: "如何使用投票功能",
    votingHelpSteps: [
      "输入选项名称并点击 Add 添加新的投票项。",
      "点击选项右侧的奖杯图标进行投票（再次点击取消）。",
      "票数最多的选项将自动排在列表顶部。",
      "只有创建者或管理员可以删除选项，项目暂停时无法投票。"
    ],
    // Team View
    currentTeam: "当前队伍",
    disbandTeam: "解散队伍",
    leave: "离开",
    leader: "队长",
    teamNamePlaceholder: "队伍名称",
    yourNicknamePlaceholder: "你的昵称",
    createTeam: "创建队伍",
    joinTeam: "加入队伍",
    fullOrClosed: "已满或关闭",
    teamHelpTitle: "组队规则说明",
    teamHelpSteps: [
      "输入队伍名称创建新队伍，默认上限为4人。",
      "点击 Join Team 加入现有队伍（每人只能加入一个）。",
      "队长可以移除成员或解散队伍。",
      "项目结束或暂停时，队伍将被锁定，无法变更成员。"
    ],
    // Roulette View
    confirmSelection: "确认抽取",
    spinMessage: "确定要转动轮盘决定赢家吗？",
    confirmSpin: "确认 & 转动",
    winnerAnnounced: "赢家公布",
    index: "索引",
    sum: "总和",
    fairRoulette: "公平轮盘",
    total: "总计",
    people: "人数",
    result: "结果",
    drawWinner: "抽取赢家",
    joinToPlay: "加入游戏",
    rouletteCannotChange: "选择一个数字。一旦提交",
    cannotBeChanged: "无法更改",
    entryNamePlaceholder: "条目名称",
    valueLabel: "数值 (0-100)",
    submitEntry: "提交条目",
    participants: "参与者",
    distributionChart: "分布图表",
    availAfterResults: "结果公布后可见",
    notEnoughData: "数据不足以显示",
    rouletteHelpTitle: "公平轮盘玩法与原理",
    rouletteHelpSteps: [
      "每位参与者提交两项数据：一个昵称和一个0-100之间的任意数值。",
      "所有参与者提交的数值总和 (Sum) 将决定最终的胜者。",
      "计算公式：Winner Index = Sum % Total Participants。",
      "公平性保证：由于无人能预知其他所有人的数值，且无法在通过后修改，因此结果是完全随机且不可被单一用户操控的。"
    ],
    // Admin
    adminTitle: "后台管理",
    exitAdmin: "退出管理",
    totalProjects: "项目总数",
    items: "选项",
    cleanOrphans: "脏数据清理 (Orphans)",
    orphanDetected: "检测到: {items} 个无效投票项, {rooms} 个无效房间, {participants} 个无效参与者。",
    forceDelete: "强制删除",
    orphanConfirm: "确认清理以下孤儿数据？\n{items} 个投票项\n{rooms} 个房间\n{participants} 个轮盘参与者",
    orphanSuccess: "清理完成！",
    orphanError: "清理出错: ",
    projectDeleteConfirm: "确定要彻底删除项目 \"{title}\" ({id}) 吗？\n注意：与之关联的数据将在下一次运行“孤儿数据清理”时被清除，或者您可以手动清理。",
    allProjectsManager: "所有项目管理",
    sortedByDate: "按创建时间排序",
    creators: "创建者",
    orphanNote: "这些数据的关联项目ID已不存在于数据库中。",
    dbEmpty: "数据库为空"
  }
};

// --- Auth Component ---
function LoginView({ lang, setLang, t }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [guestName, setGuestName] = useState(''); // Guest Login State
  // Removed explicit isSignUp state as registration is now automatic
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  // Magic Link Logic
  const handleMagicLink = async () => {
    if (!email) return setError(t('enterEmail'));
    setLoading(true);
    setError('');
    const actionCodeSettings = {
      // 必须与当前页面 URL 一致，或者是 Firebase Console 中配置的允许 URL
      url: window.location.href,
      handleCodeInApp: true,
    };
    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem('emailForSignIn', email);
      setInfo(t('magicLinkInfo'));
    } catch (e) {
      setError(t('magicLinkError') + ': ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Standard Email/Pass with Auto-Registration
  const handleEmailAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      // If user not found, try to create new account automatically
      if (e.code === 'auth/user-not-found' || e.code === 'auth/invalid-credential') {
        try {
          // Attempt registration
          const userCredential = await createUserWithEmailAndPassword(auth, email, password);
          if (userCredential.user) {
            // Set default display name using email prefix
            await updateProfile(userCredential.user, { displayName: email.split('@')[0] });
          }
        } catch (createError) {
          // If creation fails (e.g. weak password, or if invalid-credential was actually wrong password for existing user in some cases)
          // But typically 'email-already-in-use' would be the error if it existed, so here we likely catch other issues.
          if (createError.code === 'auth/email-already-in-use') {
            setError(t('passwordError')); // Simplified error for end user when we inferred it was a new user but actually wasn't (rare race condition or complex auth state)
          } else {
            setError(t('signIn') + ' failed: ' + createError.message);
          }
        }
      } else if (e.code === 'auth/wrong-password') {
        setError(t('passwordError'));
      } else {
        setError(e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Guest Login Handler
  const handleGuestLogin = async (e) => {
    e.preventDefault();
    if (!guestName.trim()) return setError(t('setGuestName'));
    setLoading(true);
    setError('');
    try {
      const result = await signInAnonymously(auth);
      // Immediately set the display name so it persists in the app
      await updateProfile(result.user, { displayName: guestName });
    } catch (e) {
      setError(t('guestLogin') + ' failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  // Social Login
  const handleSocialLogin = async (providerName) => {
    setLoading(true);
    setError('');
    let provider;
    switch (providerName) {
      case 'google': provider = new GoogleAuthProvider(); break;
      case 'github': provider = new GithubAuthProvider(); break;
      case 'microsoft': provider = new OAuthProvider('microsoft.com'); break;
      default: return;
    }
    try {
      await signInWithPopup(auth, provider);
    } catch (e) {
      setError(t('signIn') + ' failed: ' + e.message + ' (Check Firebase Console)');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-m3-surface p-4 font-sans text-m3-on-surface">
      <div className="bg-m3-surface-container w-full max-w-[400px] p-8 rounded-[28px] shadow-elevation-2">
        <div className="text-center mb-8 flex flex-col items-center">
          <div className="mb-4">
            <AtmostfairLogo className="text-4xl" />
          </div>
          <h1 className="text-2xl font-normal text-m3-on-surface">{t('signIn')}</h1>
          <p className="text-m3-on-surface-variant text-sm mt-2">{t('continueTo')}</p>
        </div>

        {error && <div className="bg-google-red/10 text-google-red p-3 rounded-lg text-sm mb-4">{error}</div>}
        {info && <div className="bg-google-green/10 text-google-green p-3 rounded-lg text-sm mb-4">{info}</div>}

        <div className="space-y-3 mb-6">
          <button onClick={() => handleSocialLogin('google')} className="relative w-full flex items-center justify-center gap-3 bg-white border border-m3-outline-variant hover:bg-gray-50 transition-colors p-2.5 rounded-full text-sm font-medium text-m3-on-surface">
            <GoogleIcon className="w-5 h-5 absolute left-4" />
            <span>{t('googleLogin')}</span>
          </button>
          <button onClick={() => handleSocialLogin('github')} className="relative w-full flex items-center justify-center gap-3 bg-white border border-m3-outline-variant hover:bg-gray-50 transition-colors p-2.5 rounded-full text-sm font-medium text-m3-on-surface">
            <GithubIcon className="w-5 h-5 absolute left-4" />
            <span>{t('githubLogin')}</span>
          </button>
          <button onClick={() => handleSocialLogin('microsoft')} className="relative w-full flex items-center justify-center gap-3 bg-white border border-m3-outline-variant hover:bg-gray-50 transition-colors p-2.5 rounded-full text-sm font-medium text-m3-on-surface">
            <MicrosoftIcon className="w-5 h-5 absolute left-4" />
            <span>{t('microsoftLogin')}</span>
          </button>
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-m3-outline-variant"></div></div>
          <div className="relative flex justify-center text-xs uppercase tracking-wider"><span className="px-2 bg-m3-surface-container text-m3-on-surface-variant">{t('or')}</span></div>
        </div>

        <form onSubmit={handleEmailAuth} className="space-y-4">
          <div className="group relative">
            <input
              type="email" required
              placeholder=" "
              value={email} onChange={e => setEmail(e.target.value)}
              className="peer w-full px-4 py-3 border border-m3-outline rounded-lg bg-transparent text-m3-on-surface focus:border-google-blue focus:border-2 outline-none transition-colors"
            />
            <label className="absolute left-3 -top-2.5 bg-m3-surface-container px-1 text-xs text-m3-on-surface-variant transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-base peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-google-blue">
              {t('emailAddr')}
            </label>
          </div>

          <div className="group relative">
            <input
              type="password" required
              placeholder=" "
              value={password} onChange={e => setPassword(e.target.value)}
              className="peer w-full px-4 py-3 border border-m3-outline rounded-lg bg-transparent text-m3-on-surface focus:border-google-blue focus:border-2 outline-none transition-colors"
            />
            <label className="absolute left-3 -top-2.5 bg-m3-surface-container px-1 text-xs text-m3-on-surface-variant transition-all peer-placeholder-shown:top-3.5 peer-placeholder-shown:text-base peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-google-blue">
              {t('password')}
            </label>
          </div>

          <div className="flex flex-col gap-3 mt-4">
            <button type="submit" disabled={loading} className="w-full bg-google-blue text-white py-2.5 rounded-full font-medium hover:shadow-elevation-1 hover:bg-google-blue/90 transition-all">
              {loading ? t('processing') : t('loginReg')}
            </button>
            <div className="flex justify-center items-center text-sm pt-2">
              <button type="button" onClick={handleMagicLink} className="text-m3-on-surface-variant hover:text-google-blue border border-m3-outline-variant/50 hover:border-google-blue/50 px-4 py-2 rounded-full text-xs transition-colors flex items-center gap-2">
                <Mail className="w-3 h-3" /> {t('magicLink')}
              </button>
            </div>
          </div>
        </form>

        {/* Guest Login Section */}
        <div className="mt-8 pt-6 border-t border-m3-outline-variant">
          <form onSubmit={handleGuestLogin} className="flex gap-2 items-center">
            <div className="relative flex-1">
              <input
                type="text"
                required
                placeholder={t('guestName')}
                value={guestName}
                onChange={e => setGuestName(e.target.value)}
                className="w-full pl-4 pr-4 py-2 bg-m3-surface border border-m3-outline-variant rounded-lg text-sm text-m3-on-surface focus:border-m3-outline outline-none"
              />
            </div>
            <button type="submit" disabled={loading} className="text-m3-on-surface font-medium text-sm hover:bg-m3-on-surface/5 px-4 py-2 rounded-full transition-colors whitespace-nowrap">
              {t('guestLogin')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// --- Main App Component ---
export default function App() {
  // Localization State
  const [lang, setLang] = useState(localStorage.getItem('app_lang') || 'zh');
  const t = (key, params = {}) => {
    let str = TRANSLATIONS[lang]?.[key] || key;
    if (typeof str !== 'string') return str;
    Object.keys(params).forEach(k => {
      str = str.replace(new RegExp(`{${k}}`, 'g'), params[k]);
    });
    return str;
  };

  const toggleLang = () => {
    const newLang = lang === 'zh' ? 'en' : 'zh';
    setLang(newLang);
    localStorage.setItem('app_lang', newLang);
  };

  // ADMIN CONFIGURATION: Add your email here to access the Admin Dashboard
  const ADMIN_EMAILS = [
    'quaternijkon@mail.ustc.edu.cn',
    // 'your-email@example.com' 
  ];

  const [user, setUser] = useState(null);
  const [currentProject, setCurrentProject] = useState(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [showAdmin, setShowAdmin] = useState(false); // Admin View Toggle

  // Check if current user is admin
  // For safety, we also check simplistic rules, but ideally use Custom Claims in Firebase
  const isAdmin = user && (ADMIN_EMAILS.includes(user.email) || ADMIN_EMAILS.length === 0 /* Disable this empty check in prod */);

  // Data State
  const [projects, setProjects] = useState([]);
  const [items, setItems] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [rouletteParticipants, setRouletteParticipants] = useState([]);

  // Check for Magic Link re-entry
  useEffect(() => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem('emailForSignIn');
      if (!email) {
        email = window.prompt(t('magicLinkPrompt'));
      }
      if (email) {
        signInWithEmailLink(auth, email, window.location.href)
          .then(() => {
            window.localStorage.removeItem('emailForSignIn');
            // Remove the query params to clean up URL
            window.history.replaceState({}, document.title, window.location.pathname);
          })
          .catch((err) => {
            console.error(err);
            alert(t('magicLinkError') + 'Login link invalid or expired');
          });
      }
    }
  }, [lang]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthChecking(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Sync (Only when logged in)
  // Changed to use Root Collections for Production
  useEffect(() => {
    if (!user) return;

    // 1. Projects
    const unsubProjects = onSnapshot(collection(db, 'projects'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setProjects(data);
    });

    // 2. Voting Items
    const unsubItems = onSnapshot(collection(db, 'voting_items'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setItems(data);
    });

    // 3. Rooms
    const unsubRooms = onSnapshot(collection(db, 'rooms'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRooms(data);
    });

    // 4. Roulette
    const unsubRoulette = onSnapshot(collection(db, 'roulette_participants'), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRouletteParticipants(data);
    });

    return () => {
      unsubProjects();
      unsubItems();
      unsubRooms();
      unsubRoulette();
    };
  }, [user]);

  // --- Actions ---

  const handleCreateProject = async (title, type, creatorName, password) => {
    if (!user || !title.trim()) return;
    try {
      const newProject = {
        title,
        type,
        creatorId: user.uid,
        creatorName: creatorName || user.displayName || 'Anonymous',
        password: password || '',
        status: 'active',
        createdAt: Date.now(),
        winners: []
      };
      const docRef = await addDoc(collection(db, 'projects'), newProject);
      setCurrentProject({ id: docRef.id, ...newProject });
    } catch (e) { console.error(e); }
  };

  const handleToggleProjectStatus = async (project) => {
    if (!user || user.uid !== project.creatorId) return;
    if (project.status === 'finished') return;
    const newStatus = project.status === 'active' ? 'stopped' : 'active';
    await updateDoc(doc(db, 'projects', project.id), { status: newStatus });
    setCurrentProject((prev) => ({ ...prev, status: newStatus }));
  };

  const handleDeleteProject = async (projectId) => {
    await deleteDoc(doc(db, 'projects', projectId));
    setCurrentProject(null);
  };

  // Vote Actions
  const handleAddItem = async (title, projectId, creatorName) => {
    if (!title.trim() || !user) return;
    await addDoc(collection(db, 'voting_items'), {
      title, projectId, creatorId: user.uid, creatorName: creatorName || user.displayName || 'Anonymous', votes: [], createdAt: Date.now()
    });
  };
  const handleDeleteItem = async (itemId) => deleteDoc(doc(db, 'voting_items', itemId));
  const handleVote = async (item) => {
    if (!user) return;
    const itemRef = doc(db, 'voting_items', item.id);
    const hasVoted = item.votes?.includes(user.uid);
    if (hasVoted) await updateDoc(itemRef, { votes: arrayRemove(user.uid) });
    else await updateDoc(itemRef, { votes: arrayUnion(user.uid) });
  };

  // Team Actions
  const handleCreateRoom = async (name, maxMembers, projectId, creatorName) => {
    if (!user || !name.trim()) return;
    await addDoc(collection(db, 'rooms'), {
      name, projectId, ownerId: user.uid, maxMembers: parseInt(maxMembers) || 4,
      members: [{ uid: user.uid, name: creatorName || user.displayName || 'User', joinedAt: Date.now() }], createdAt: Date.now()
    });
  };
  const handleJoinRoom = async (roomId, userName) => {
    if (!user) return;
    const roomRef = doc(db, 'rooms', roomId);
    await updateDoc(roomRef, { members: arrayUnion({ uid: user.uid, name: userName || user.displayName || 'Anonymous', joinedAt: Date.now() }) });
  };
  const handleKickMember = async (roomId, memberObject) => {
    await updateDoc(doc(db, 'rooms', roomId), { members: arrayRemove(memberObject) });
  };
  const handleDeleteRoom = async (roomId) => deleteDoc(doc(db, 'rooms', roomId));

  // Roulette Actions
  const handleJoinRoulette = async (projectId, userName, value) => {
    if (!user) return;
    await addDoc(collection(db, 'roulette_participants'), {
      projectId, uid: user.uid, name: userName || user.displayName, value: parseInt(value) || 0, joinedAt: Date.now(), isWinner: false
    });
  };
  const handleRecordWinner = async (projectId, winnerInfo) => {
    const projectRef = doc(db, 'projects', projectId);
    await updateDoc(projectRef, {
      winners: arrayUnion({ ...winnerInfo, wonAt: Date.now() }),
      status: 'finished'
    });
    if (winnerInfo.participantId) {
      await updateDoc(doc(db, 'roulette_participants', winnerInfo.participantId), { isWinner: true });
    }
  };

  // --- Render ---
  if (authChecking) return <div className="min-h-screen flex items-center justify-center bg-m3-surface">{t('loading')}</div>;
  if (!user) return <LoginView lang={lang} setLang={setLang} t={t} toggleLang={toggleLang} />;

  return (
    <div className="min-h-screen bg-m3-surface text-m3-on-surface font-sans">
      <nav className="bg-m3-surface-container px-6 py-3 flex justify-between items-center sticky top-0 z-20 shadow-none border-b border-white/50">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentProject(null)}>
          <AtmostfairLogo className="text-2xl" />
        </div>
        {currentProject && (
          <div className="hidden md:flex items-center gap-2 text-sm bg-m3-surface-container-high px-4 py-1.5 rounded-full border border-m3-outline-variant">
            {currentProject.password && <Key className="w-3 h-3 text-google-yellow" />}
            <span className="font-semibold text-m3-on-surface">{currentProject.title}</span>
            <span className="text-m3-on-surface-variant">by {currentProject.creatorName}</span>
          </div>
        )}
        <div className="flex items-center gap-4">
          <button onClick={toggleLang} className="text-sm font-medium text-m3-on-surface-variant hover:text-google-blue px-2 transition-colors">{t('switchLang')}</button>
          {isAdmin && (
            <button
              onClick={() => { setShowAdmin(!showAdmin); setCurrentProject(null); }}
              className={`p-2 rounded-full transition-colors ${showAdmin ? 'bg-google-blue text-white' : 'text-m3-on-surface-variant hover:bg-google-blue/10'}`}
              title={t('adminConsole')}
            >
              <Shield className="w-5 h-5" />
            </button>
          )}
          <div className="text-sm text-m3-on-surface-variant hidden sm:block">{t('hello')}, {user.displayName || user.email || 'Guest'}</div>
          <button onClick={() => signOut(auth)} className="text-m3-on-surface-variant hover:text-google-red p-2 rounded-full hover:bg-google-red/10 transition-colors" title={t('logout')}><LogOut className="w-5 h-5" /></button>
        </div>
      </nav>

      <main className="max-w-[1200px] mx-auto p-4 md:p-6 lg:p-8">
        {showAdmin && isAdmin ? (
          <AdminDashboard
            projects={projects}
            items={items}
            rooms={rooms}
            rouletteParticipants={rouletteParticipants}
            onClose={() => setShowAdmin(false)}
            t={t}
          />
        ) : !currentProject ? (
          <HomeView projects={projects} onCreateProject={handleCreateProject} onSelectProject={setCurrentProject} defaultName={user.displayName || ''} t={t} />
        ) : (
          <ProjectDetailView
            user={user}
            isAdmin={isAdmin}
            project={projects.find(p => p.id === currentProject.id) || currentProject}
            items={items.filter(i => i.projectId === currentProject.id)}
            rooms={rooms.filter(r => r.projectId === currentProject.id)}
            rouletteData={rouletteParticipants.filter(r => r.projectId === currentProject.id)}
            onExit={() => setCurrentProject(null)}
            actions={{ handleAddItem, handleDeleteItem, handleVote, handleCreateRoom, handleJoinRoom, handleKickMember, handleDeleteRoom, handleToggleProjectStatus, handleDeleteProject, handleJoinRoulette, handleRecordWinner }}
            t={t}
          />
        )}
      </main>
    </div>
  );
}

// --- Home View ---
function HomeView({ projects, onCreateProject, onSelectProject, defaultName, t }) {
  // Navigation State: 'collect' | 'connect' | 'select'
  const [activeTab, setActiveTab] = useState('collect');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Creation Flow State
  const [showCreate, setShowCreate] = useState(false);
  const [selectedModule, setSelectedModule] = useState(null); // Sub-selection
  const [newTitle, setNewTitle] = useState('');
  const [creatorName, setCreatorName] = useState(defaultName);
  const [newPassword, setNewPassword] = useState('');
  
  // Unlock Password State
  const [passwordPromptProject, setPasswordPromptProject] = useState(null);
  const [inputPassword, setInputPassword] = useState('');
  const [passwordError, setPasswordError] = useState(false);

  // Configuration Mapping
  const CATEGORIES = {
    collect: { 
      label: t('collect'), 
      color: 'text-google-blue', 
      bg: 'bg-google-blue',
      // Legacy 'type' mapping: 'vote' projects belong to 'collect'
      types: ['vote'], 
      modules: [
        { id: 'vote', label: t('voting'), icon: Vote, desc: t('votingDesc') }
      ]
    },
    connect: { 
      label: t('connect'), 
      color: 'text-google-red', 
      bg: 'bg-google-red',
      // Legacy 'type' mapping: 'team' projects belong to 'connect'
      types: ['team'], 
      modules: [
        { id: 'team', label: t('teams'), icon: Users, desc: t('teamsDesc') }
      ]
    },
    select: { 
      label: t('select'), 
      color: 'text-google-yellow', 
      bg: 'bg-google-yellow',
      // Legacy 'type' mapping: 'roulette' projects belong to 'select'
      types: ['roulette'], 
      modules: [
        { id: 'roulette', label: t('roulette'), icon: Dices, desc: t('rouletteDesc') }
      ]
    }
  };

  const currentCategory = CATEGORIES[activeTab];

  const filteredProjects = useMemo(() => {
    return projects.filter((p) => 
      currentCategory.types.includes(p.type) && 
      (p.title.toLowerCase().includes(searchTerm.toLowerCase()) || p.id.includes(searchTerm))
    );
  }, [projects, searchTerm, activeTab, currentCategory]);

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    if (!selectedModule) return;
    // Pass the module ID (e.g. 'vote') as the 'type' to backend
    onCreateProject(newTitle, selectedModule.id, creatorName, newPassword);
    setShowCreate(false); 
    setNewTitle(''); 
    setNewPassword('');
    setSelectedModule(null);
  };

  const handleProjectClick = (project) => {
    if (project.password) {
      setPasswordPromptProject(project); setInputPassword(''); setPasswordError(false);
    } else {
      onSelectProject(project);
    }
  };

  const verifyPassword = (e) => {
    e.preventDefault();
    if (inputPassword === passwordPromptProject.password) {
      onSelectProject(passwordPromptProject); setPasswordPromptProject(null);
    } else { setPasswordError(true); }
  };

  // Styles Helper for Grid
  const styles = {
    vote: { color: 'text-google-blue', bgParams: 'bg-google-blue/10', activeColor: 'text-google-blue', activeBg: 'bg-google-blue/20' },
    team: { color: 'text-google-red', bgParams: 'bg-google-red/10', activeColor: 'text-google-red', activeBg: 'bg-google-red/20' },
    roulette: { color: 'text-google-yellow', bgParams: 'bg-google-yellow/10', activeColor: 'text-google-yellow', activeBg: 'bg-google-yellow/20' },
  };

  const TabButton = ({ id, label, icon: Icon }) => (
    <button onClick={() => { setActiveTab(id); setShowCreate(false); setSelectedModule(null); }} className={`flex-1 min-w-[100px] py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-all rounded-full ${activeTab === id ? 'bg-m3-secondary-container text-m3-on-secondary-container shadow-sm' : 'text-m3-on-surface-variant hover:bg-m3-on-surface/5'}`}>
      {activeTab === id && <Icon className="w-4 h-4" />}
      <span>{label}</span>
      {activeTab !== id && <Icon className="w-4 h-4 opacity-50" />}
    </button>
  );

  return (
    <div className="animate-fade-in space-y-6">
      {passwordPromptProject && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-m3-surface-container rounded-[28px] p-6 w-full max-w-sm shadow-elevation-3">
            <div className="flex flex-col items-center mb-4">
              <Lock className="w-8 h-8 text-m3-on-surface mb-2" />
              <h3 className="text-2xl font-normal text-m3-on-surface">{t('lockTitle')}</h3>
              <p className="text-sm text-m3-on-surface-variant">{t('verifyAccess')}</p>
            </div>
            <form onSubmit={verifyPassword}>
              <div className="relative mb-2">
                <input
                  type="password" value={inputPassword}
                  onChange={e => { setInputPassword(e.target.value); setPasswordError(false); }}
                  className="w-full px-4 py-3 bg-m3-surface text-m3-on-surface border border-m3-outline rounded-lg outline-none focus:border-google-blue focus:border-2"
                  placeholder={t('enterPassword')} autoFocus
                />
              </div>
              {passwordError && <p className="text-google-red text-xs mb-4 ml-1">{t('incorrectPass')}</p>}
              <div className="flex justify-end gap-2 mt-6">
                <button type="button" onClick={() => setPasswordPromptProject(null)} className="px-5 py-2.5 text-google-blue font-medium hover:bg-google-blue/10 rounded-full text-sm">{t('cancel')}</button>
                <button type="submit" className="px-5 py-2.5 bg-google-blue text-white rounded-full font-medium text-sm hover:shadow-elevation-1">{t('unlock')}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Navigation Rail / Tabs (Renamed) */}
      <div className="flex justify-center mb-8">
        <div className="bg-m3-surface-container-high p-1 rounded-full inline-flex w-full max-w-md border border-m3-outline-variant/30">
          <TabButton id="collect" label={t('collect')} icon={Vote} />
          <TabButton id="connect" label={t('connect')} icon={Users} />
          <TabButton id="select" label={t('select')} icon={Dices} />
        </div>
      </div>

      {/* Search & Action Bar */}
      <div className="flex flex-col md:flex-row gap-4 items-center">
        <div className="relative w-full flex-1 group">
          <div className="absolute left-4 top-1/2 -translate-y-1/2"><Search className="w-5 h-5 text-m3-on-surface-variant group-focus-within:text-google-blue" /></div>
          <input
            type="text"
            placeholder={t('searchPlaceholder', { label: currentCategory.label })}
            value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3.5 bg-m3-surface-container-high rounded-full border-none outline-none focus:ring-2 focus:ring-google-blue/50 text-m3-on-surface transition-all hover:bg-m3-surface-container-high/80"
          />
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className={`w-full md:w-auto flex items-center justify-center gap-2 pl-6 pr-8 py-4 rounded-2xl font-medium text-m3-on-primary-container bg-m3-primary-container hover:shadow-elevation-1 transition-all`}>
          {showCreate ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          <span className="text-base">{showCreate ? t('closeCreator') : t('newProject')}</span>
        </button>
      </div>

      {showCreate && (
        <div className="p-6 rounded-[28px] bg-m3-surface-container border border-m3-outline-variant/50 animate-slide-down">
          <h3 className="text-xl font-normal text-m3-on-surface mb-6">{t('createTitle', { type: currentCategory.label })}</h3>
          
          <form onSubmit={handleCreateSubmit} className="flex flex-col gap-5">
            {/* Sub-selection Page: Choose Module */}
            <div className="mb-2">
              <label className="text-xs text-m3-on-surface-variant mb-3 block uppercase tracking-wider font-medium">{t('selectTool')}</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {currentCategory.modules.map((mod) => (
                  <div 
                    key={mod.id} 
                    onClick={() => setSelectedModule(mod)} 
                    className={`cursor-pointer p-4 rounded-xl border transition-all flex items-start gap-4 ${selectedModule?.id === mod.id ? `border-${currentCategory.color.split('-')[1]}-google bg-m3-secondary-container` : 'border-m3-outline-variant/30 hover:bg-m3-surface'}`}
                    style={{ borderColor: selectedModule?.id === mod.id ? 'var(--tw-ring-color)' : '' }}
                  >
                    <div className={`p-2 rounded-full ${selectedModule?.id === mod.id ? 'bg-white/50' : 'bg-m3-surface-container-high'}`}>
                      <mod.icon className={`w-6 h-6 ${currentCategory.color}`} />
                    </div>
                    <div>
                      <div className="font-medium text-m3-on-surface">{mod.label}</div>
                      <div className="text-xs text-m3-on-surface-variant mt-1">{mod.desc}</div>
                    </div>
                  </div>
                ))}
                {/* Placeholder for future modules */}
                <div className="p-4 rounded-xl border border-dashed border-m3-outline-variant/30 flex items-center justify-center text-m3-on-surface-variant/50 text-sm italic">
                  {t('moreComing')}
                </div>
              </div>
            </div>

            {selectedModule && (
              <div className="animate-fade-in space-y-5 border-t border-m3-outline-variant/20 pt-5 mt-2">
                 <div className="flex flex-col md:flex-row gap-4">
                  <div className="flex-1">
                    <label className="text-xs text-m3-on-surface-variant ml-3 mb-1 block">{t('projTitle')}</label>
                    <input type="text" placeholder={t('projTitlePlaceholder')} value={newTitle} onChange={e => setNewTitle(e.target.value)} className="w-full px-4 py-3 bg-m3-surface rounded-xl border border-m3-outline outline-none focus:border-google-blue focus:border-2 text-m3-on-surface" required />
                  </div>
                  <div className="w-full md:w-1/3">
                    <label className="text-xs text-m3-on-surface-variant ml-3 mb-1 block">{t('creatorName')}</label>
                    <input type="text" placeholder={t('creatorNamePlaceholder')} value={creatorName} onChange={e => setCreatorName(e.target.value)} className="w-full px-4 py-3 bg-m3-surface rounded-xl border border-m3-outline outline-none focus:border-google-blue focus:border-2 text-m3-on-surface" required />
                  </div>
                </div>
                <div className="flex flex-col md:flex-row gap-4 items-end">
                  <div className="flex-1 w-full">
                    <label className="text-xs text-m3-on-surface-variant ml-3 mb-1 block">{t('accessPass')}</label>
                    <input type="text" placeholder={t('leaveEmpty')} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-4 py-3 bg-m3-surface rounded-xl border border-m3-outline outline-none focus:border-google-blue focus:border-2 text-m3-on-surface" />
                  </div>
                  <button type="submit" className={`w-full md:w-auto px-8 py-3.5 rounded-full font-medium text-white shadow-elevation-1 hover:shadow-elevation-2 transition-shadow ${currentCategory.bg}`}>
                    {t('createBtn', { label: selectedModule.label })}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      )}

      {loadingGrid(filteredProjects, handleProjectClick, styles, t)}
    </div>
  );
}

// Helper to render grid to keep main component clean
const loadingGrid = (filteredProjects, handleProjectClick, styles, t) => (
  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
    {filteredProjects.map((project) => {
      // Map project type to legacy style keys
      const styleKey = project.type; 
      const activeStyle = styles[styleKey] || styles.vote;

      const isActive = project.status !== 'stopped' && project.status !== 'finished';
      const statusColor = isActive ? activeStyle.activeColor : 'text-m3-on-surface-variant'; 
      const statusBg = isActive ? activeStyle.activeBg : 'bg-m3-on-surface/5';

      return (
      <div key={project.id} onClick={() => handleProjectClick(project)} className="group cursor-pointer bg-m3-surface-container-high p-0 rounded-[24px] border border-transparent hover:border-m3-outline-variant hover:shadow-elevation-1 transition-all overflow-hidden relative active:scale-[0.99] active:shadow-none">
        <div className="p-5 h-full flex flex-col">
          <div className="flex justify-between items-start mb-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${statusBg}`}>
              {project.type === 'vote' ? <Vote className={`w-5 h-5 ${statusColor}`} /> :
                project.type === 'team' ? <Users className={`w-5 h-5 ${statusColor}`} /> :
                  <Dices className={`w-5 h-5 ${statusColor}`} />}
            </div>
            {project.status === 'finished' && <span className="bg-m3-on-surface/10 text-m3-on-surface-variant text-xs px-2 py-1 rounded-md font-medium">{t('finished')}</span>}
            {project.status === 'stopped' && <span className="bg-m3-on-surface/10 text-m3-on-surface-variant text-xs px-2 py-1 rounded-md font-medium">{t('paused')}</span>}
            {project.password && <Lock className={`w-4 h-4 ${isActive ? 'text-google-yellow' : 'text-m3-on-surface-variant'}`} />}
          </div>
          <h3 className={`font-medium text-lg mb-1 transition-colors px-1 truncate ${isActive ? 'text-m3-on-surface font-semibold' : 'text-m3-on-surface-variant'}`}>{project.title}</h3>
          <div className="mt-auto pt-4 flex justify-between items-center text-xs text-m3-on-surface-variant px-1 border-t border-m3-outline-variant/20">
            <span className="font-mono opacity-70">ID: {project.id.slice(0, 6)}</span>
            <span className="opacity-70">{project.creatorName}</span>
          </div>
        </div>
      </div>
    );
    })}
    {filteredProjects.length === 0 && (
      <div className="col-span-full flex flex-col items-center justify-center py-16 text-m3-on-surface-variant/50 border-2 border-dashed border-m3-outline-variant/30 rounded-[28px]">
        <FolderPlus className="w-12 h-12 mb-3 opacity-20" />
        <p>{t('noProjects')}</p>
      </div>
    )}
  </div>
);

// --- Detail View ---
function ProjectDetailView({ user, isAdmin, project, items, rooms, rouletteData, onExit, actions, t }) {
  const isOwner = user?.uid === project.creatorId;
  const hasAdminRights = isOwner || isAdmin;
  const isStopped = project.status === 'stopped';
  const isFinished = project.status === 'finished';
  const copyId = () => { navigator.clipboard.writeText(project.id); };

  return (
    <div className="animate-fade-in pb-20">
      <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-6 border-b border-m3-outline-variant/20">
        <div>
          <button onClick={onExit} className="flex items-center text-sm font-medium text-m3-on-surface-variant hover:text-google-blue mb-3 transition-colors px-3 py-1.5 -ml-3 rounded-full hover:bg-m3-on-surface/5"><ArrowLeft className="w-5 h-5 mr-1" /> {t('backToDash')}</button>
          <h1 className="text-4xl font-normal text-m3-on-surface flex items-center gap-3">
            {project.title}
          </h1>
          <div className="flex items-center flex-wrap gap-2 mt-3">
            <div className="flex items-center gap-2 bg-m3-surface-container px-3 py-1 rounded-full border border-m3-outline-variant/30">
              <span className="text-xs font-mono text-m3-on-surface-variant select-all">{project.id}</span>
              <button onClick={copyId} className="cursor-pointer text-m3-on-surface-variant hover:text-google-blue"><Copy className="w-3 h-3" /></button>
            </div>
            {project.password && <div className="p-1.5 rounded-full bg-google-yellow/20"><Key className="w-4 h-4 text-google-yellow" /></div>}
            {isStopped && <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-m3-surface-container-high text-xs font-medium text-m3-on-surface-variant border border-m3-outline-variant"><Lock className="w-3 h-3" /> {t('paused')}</div>}
            {isFinished && <div className="flex items-center gap-1 px-3 py-1 rounded-full bg-google-red/10 text-xs font-medium text-google-red border border-google-red/20"><Flag className="w-3 h-3" /> {t('finished')}</div>}
          </div>
        </div>
        {hasAdminRights && !isFinished && (
          <div className="flex gap-2">
            <button onClick={() => actions.handleToggleProjectStatus(project)} className={`flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm transition-all ${isStopped ? 'bg-m3-primary-container text-m3-on-primary-container hover:shadow-elevation-1' : 'bg-m3-surface-container-high text-m3-on-surface hover:bg-m3-surface-container-high/80 border border-m3-outline-variant'}`}>{isStopped ? t('resume') : t('pause')}</button>
            <button onClick={() => { if (window.confirm(t('deleteConfirm'))) actions.handleDeleteProject(project.id); }} className="flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm text-google-red hover:bg-google-red/10"><Trash2 className="w-4 h-4" /> {t('delete')}</button>
          </div>
        )}
        {hasAdminRights && isFinished && (
          <button onClick={() => { if (window.confirm(t('deleteConfirm'))) actions.handleDeleteProject(project.id); }} className="flex items-center gap-2 px-5 py-2.5 rounded-full font-medium text-sm bg-google-red text-white hover:shadow-elevation-1"><Trash2 className="w-4 h-4" /> {t('deleteProject')}</button>
        )}
      </div>

      {project.type === 'vote' && <VotingView user={user} isAdmin={isAdmin} items={items} isStopped={isStopped || isFinished} onAdd={(t, n) => actions.handleAddItem(t, project.id, n)} onDelete={actions.handleDeleteItem} onVote={actions.handleVote} isProjectOwner={isOwner} projectId={project.id} t={t} />}
      {project.type === 'team' && <TeamView user={user} isAdmin={isAdmin} rooms={rooms} isStopped={isStopped || isFinished} onCreate={(n, m, cn) => actions.handleCreateRoom(n, m, project.id, cn)} onJoin={actions.handleJoinRoom} onKick={actions.handleKickMember} onDelete={actions.handleDeleteRoom} projectId={project.id} t={t} />}
      {project.type === 'roulette' && <RouletteView user={user} isAdmin={isAdmin} project={project} participants={rouletteData} isStopped={isStopped} isFinished={isFinished} isOwner={isOwner} actions={actions} t={t} />}
    </div>
  );
}

// --- Helper Components ---
const InfoCard = ({ title, steps, icon: Icon = Info }) => (
  <div className="mt-8 bg-m3-surface-container-low p-6 rounded-[24px] border border-m3-outline-variant/30 flex gap-4 text-sm">
    <div className="mt-1 text-m3-on-surface-variant"><Icon className="w-5 h-5" /></div>
    <div className="flex-1">
      <h4 className="font-medium text-m3-on-surface mb-2">{title}</h4>
      <ol className="list-decimal list-inside space-y-1 text-m3-on-surface-variant marker:text-m3-on-surface-variant/50">
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
    </div>
  </div>
);

// --- Sub-Components ---
function VotingView({ user, isAdmin, items, isStopped, onAdd, onDelete, onVote, isProjectOwner, t }) {
  const [newItem, setNewItem] = useState('');
  const [myName, setMyName] = useState(user.displayName || '');
  const sortedItems = [...items].sort((a, b) => (b.votes?.length || 0) - (a.votes?.length || 0));
  return (
    <div>
      {!isStopped && (
        <div className="mb-8 p-4 bg-m3-surface-container rounded-[24px] flex flex-col sm:flex-row gap-4">
          <input type="text" value={newItem} onChange={e => setNewItem(e.target.value)} placeholder={t('addItemPlaceholder')} className="flex-[2] px-4 py-3 rounded-xl border border-m3-outline outline-none focus:border-google-blue focus:border-2 bg-m3-surface text-m3-on-surface transition-all" />
          <input type="text" value={myName} onChange={e => setMyName(e.target.value)} placeholder={t('yourNamePlaceholder')} className="flex-1 px-4 py-3 rounded-xl border border-m3-outline outline-none focus:border-google-blue focus:border-2 bg-m3-surface text-m3-on-surface transition-all" />
          <button onClick={() => { if (newItem.trim()) { onAdd(newItem, myName); setNewItem(''); } }} className="bg-google-blue text-white px-8 py-3 rounded-full font-medium shadow-elevation-1 hover:shadow-elevation-2 transition-shadow">{t('add')}</button>
        </div>
      )}
      <div className="space-y-3">
        {sortedItems.map((item, index) => {
          const isVoted = item.votes?.includes(user.uid);
          const canDelete = isAdmin || ((item.creatorId === user.uid || isProjectOwner) && !isStopped);
          return (
            <div key={item.id} className={`bg-m3-surface-container-high p-4 rounded-[20px] relative overflow-hidden flex items-center justify-between transition-colors ${isVoted ? 'bg-m3-primary-container/30 border border-google-blue/30' : 'border border-transparent'}`}>
              <div className="flex items-center gap-5 flex-1 z-10">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${isVoted ? 'bg-google-blue text-white' : 'bg-m3-surface-container text-m3-on-surface-variant'}`}>{index + 1}</div>
                <div><h3 className="font-medium text-lg text-m3-on-surface">{item.title}</h3><div className="text-sm text-m3-on-surface-variant">{item.votes?.length || 0} {t('votes')} • {t('addedBy')} {item.creatorName}</div></div>
              </div>
              <div className="flex items-center gap-2 z-10">
                <button onClick={() => !isStopped && onVote(item)} disabled={isStopped} className={`p-3 rounded-full transition-all ${isVoted ? 'bg-google-blue text-white shadow-elevation-1' : 'bg-m3-surface text-m3-on-surface-variant hover:bg-m3-on-surface/10'}`}><Trophy className="w-5 h-5" /></button>
                {canDelete && <button onClick={() => onDelete(item.id)} className="p-3 text-m3-on-surface-variant hover:text-google-red hover:bg-google-red/10 rounded-full"><Trash2 className="w-5 h-5" /></button>}
              </div>
            </div>
          );
        })}
      </div>
      <InfoCard
        title={t('votingHelpTitle')}
        steps={t('votingHelpSteps')}
      />
    </div>
  );
}

function TeamView({ user, isAdmin, rooms, isStopped, onCreate, onJoin, onKick, onDelete, projectId, t }) {
  const [newRoomName, setNewRoomName] = useState('');
  const [myName, setMyName] = useState(user.displayName || '');
  const sortedRooms = [...rooms].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const currentRoom = sortedRooms.find((r) => r.members?.some((m) => m.uid === user.uid));

  if (currentRoom) {
    const isRoomOwner = currentRoom.ownerId === user.uid;
    const canManage = isRoomOwner || isAdmin;
    return (
      <div className="bg-m3-surface-container rounded-[28px] overflow-hidden shadow-elevation-1">
        <div className="bg-google-red text-white p-6 flex justify-between items-center">
          <div><div className="text-white/80 text-xs font-medium uppercase tracking-wider mb-1">{t('currentTeam')}</div><h2 className="text-2xl font-normal">{currentRoom.name}</h2></div>
          <div className="flex gap-2">
            {(canManage && !isStopped) || isAdmin ? <button onClick={() => onDelete(currentRoom.id)} className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-sm transition-colors">{t('disbandTeam')}</button> : null}
            <button onClick={() => onKick(currentRoom.id, currentRoom.members.find((m) => m.uid === user.uid))} className="bg-white text-google-red px-4 py-2 rounded-full text-sm font-medium shadow-sm hover:shadow-md transition-shadow">{t('leave')}</button>
          </div>
        </div>
        <div className="p-6 grid gap-4 sm:grid-cols-2">
          {currentRoom.members.map((m) => (
            <div key={m.joinedAt} className="flex justify-between items-center p-4 bg-m3-surface rounded-xl border border-m3-outline-variant/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-google-red/20 text-google-red flex items-center justify-center font-bold text-xs">{m.name.charAt(0)}</div>
                <div className="text-m3-on-surface font-medium">{m.name} {m.uid === currentRoom.ownerId && <span className="text-xs font-normal text-m3-on-surface-variant ml-1">({t('leader')})</span>}</div>
              </div>
              {canManage && m.uid !== user.uid && (!isStopped || isAdmin) && <button onClick={() => onKick(currentRoom.id, m)} className="text-m3-error hover:bg-m3-error/10 p-2 rounded-full"><X className="w-4 h-4" /></button>}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div>
      {!isStopped && (
        <div className="mb-8 bg-m3-surface-container rounded-[24px] p-6 flex flex-col sm:flex-row gap-4 border border-m3-outline-variant/30">
          <input type="text" value={newRoomName} onChange={e => setNewRoomName(e.target.value)} placeholder={t('teamNamePlaceholder')} className="flex-1 px-4 py-3 bg-m3-surface rounded-xl border border-m3-outline outline-none focus:border-google-red focus:border-2 text-m3-on-surface" />
          <input type="text" value={myName} onChange={e => setMyName(e.target.value)} placeholder={t('yourNicknamePlaceholder')} className="w-full sm:w-48 px-4 py-3 bg-m3-surface rounded-xl border border-m3-outline outline-none focus:border-google-red focus:border-2 text-m3-on-surface" />
          <button onClick={() => { if (newRoomName.trim()) { onCreate(newRoomName, 4, myName); setNewRoomName(''); } }} className="bg-google-red text-white px-8 py-3 rounded-full font-medium shadow-elevation-1 hover:shadow-elevation-2">{t('createTeam')}</button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {sortedRooms.map((room) => (
          <div key={room.id} className="bg-m3-surface-container-high p-6 rounded-[24px] border border-transparent transition-all">
            <div className="flex justify-between items-start mb-4">
              <h4 className="font-medium text-lg text-m3-on-surface">{room.name}</h4>
              <div className="bg-m3-surface text-xs font-medium px-2 py-1 rounded-md text-m3-on-surface-variant border border-m3-outline-variant/50">{room.members.length} / {room.maxMembers}</div>
            </div>
            {!isStopped && room.members.length < room.maxMembers ? (
              <button onClick={() => onJoin(room.id, user.displayName)} className="w-full border border-m3-outline-variant text-google-red font-medium py-2.5 rounded-full hover:bg-google-red/5 transition-colors">{t('joinTeam')}</button>
            ) : (
              <button disabled className="w-full bg-m3-surface-container text-m3-on-surface-variant py-2.5 rounded-full text-sm cursor-not-allowed">{t('fullOrClosed')}</button>
            )}
          </div>
        ))}
      </div>
      <InfoCard
        title={t('teamHelpTitle')}
        steps={t('teamHelpSteps')}
      />
    </div>
  );
}

// --- Roulette View ---
function RouletteView({ user, isAdmin, project, participants, isStopped, isFinished, isOwner, actions, t }) {
  const [joinName, setJoinName] = useState(user.displayName || '');
  const [joinValue, setJoinValue] = useState(50);
  const [showResultModal, setShowResultModal] = useState(false);

  const sortedParticipants = [...participants].sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));
  const activeParticipants = sortedParticipants.filter((p) => !p.isWinner);
  const myParticipant = sortedParticipants.find((p) => p.uid === user?.uid);
  const isMeWinner = myParticipant?.isWinner;
  const finalWinner = isFinished && project.winners?.length > 0 ? project.winners[project.winners.length - 1] : null;

  const totalValue = activeParticipants.reduce((acc, curr) => acc + (curr.value || 0), 0);
  const count = activeParticipants.length;
  const winnerIndex = count > 0 ? totalValue % count : 0;
  const winnerCandidate = activeParticipants[winnerIndex];

  const canDraw = (isOwner || isAdmin) && !isStopped && count > 0;

  const confirmDraw = () => {
    actions.handleRecordWinner(project.id, { participantId: winnerCandidate.id, name: winnerCandidate.name, uid: winnerCandidate.uid, winningNumber: winnerIndex, totalValueSnapshot: totalValue, participantCountSnapshot: count });
    setShowResultModal(false);
  };

  const data = useMemo(() => {
    let cumulativeSum = 0;
    const targetList = isFinished ? sortedParticipants : activeParticipants;
    return targetList.map((p, i) => { cumulativeSum += (p.value || 0); return { x: i, y: cumulativeSum % (i + 1) }; });
  }, [participants, isFinished]);

  return (
    <div className="space-y-8 animate-fade-in relative pb-10">
      {showResultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-m3-surface-container text-m3-on-surface w-full max-w-lg rounded-[28px] p-8 shadow-elevation-3">
            <h2 className="text-2xl font-normal mb-4 text-center">{t('confirmSelection')}</h2>
            <p className="text-center text-m3-on-surface-variant mb-8">{t('spinMessage')}</p>
            <div className="flex gap-4">
              <button onClick={() => setShowResultModal(false)} className="flex-1 py-3 text-google-blue font-medium hover:bg-google-blue/5 rounded-full">{t('cancel')}</button>
              <button onClick={confirmDraw} className="flex-1 py-3 bg-google-blue text-white rounded-full font-medium shadow-elevation-1">{t('confirmSpin')}</button>
            </div>
          </div>
        </div>
      )}

      {isFinished ? (
        <div className="bg-m3-surface-container-high rounded-[32px] p-10 text-center relative overflow-hidden border border-google-yellow/50 shadow-elevation-1">
          <div className="relative z-10 animate-scale-in">
            <div className="inline-block p-4 rounded-full bg-google-yellow text-white mb-6 shadow-elevation-2"><Crown className="w-12 h-12" /></div>
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-m3-on-surface-variant mb-2">{t('winnerAnnounced')}</h2>
            <h2 className="text-5xl font-normal text-m3-on-surface mb-8">{finalWinner?.name}</h2>
            <div className="flex flex-wrap justify-center gap-4">
              <div className="bg-m3-surface px-6 py-4 rounded-2xl border border-m3-outline-variant/30 min-w-[120px]"><div className="text-xs text-m3-on-surface-variant uppercase tracking-widest mb-1">{t('index')}</div><div className="text-3xl font-mono text-google-yellow">{finalWinner?.winningNumber}</div></div>
              <div className="bg-m3-surface px-6 py-4 rounded-2xl border border-m3-outline-variant/30 min-w-[120px]"><div className="text-xs text-m3-on-surface-variant uppercase tracking-widest mb-1">{t('sum')}</div><div className="text-3xl font-mono text-m3-on-surface">{finalWinner?.totalValueSnapshot}</div></div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-m3-surface-container rounded-[32px] p-8 md:p-10 relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="w-full md:w-auto">
              <h2 className="text-3xl font-normal mb-2 flex items-center gap-3 text-m3-on-surface"><Dices className="w-8 h-8 text-google-yellow" /> {t('fairRoulette')}</h2>
              <div className="flex items-center gap-4 mt-6 bg-m3-surface p-4 rounded-2xl border border-m3-outline-variant/30 overflow-x-auto">
                <div className="text-center px-2"><div className="text-xs font-medium uppercase text-m3-on-surface-variant">{t('total')}</div><div className="text-xl font-mono text-m3-on-surface">???</div></div>
                <div className="text-m3-on-surface-variant font-light text-2xl">%</div>
                <div className="text-center px-2"><div className="text-xs font-medium uppercase text-m3-on-surface-variant">{t('people')}</div><div className="text-xl font-mono text-m3-on-surface">{count}</div></div>
                <div className="text-m3-on-surface-variant font-light text-2xl">=</div>
                <div className="text-center px-2"><div className="text-xs font-medium uppercase text-m3-on-surface-variant">{t('result')}</div><div className="text-xl font-mono text-google-yellow">???</div></div>
              </div>
            </div>
            {canDraw && <button onClick={() => setShowResultModal(true)} className="w-full md:w-auto px-8 py-4 bg-google-yellow text-gray-900 font-medium rounded-2xl shadow-elevation-2 hover:shadow-elevation-3 transition-shadow flex items-center justify-center gap-2"><Crown className="w-5 h-5" /> {t('drawWinner')}</button>}
          </div>
        </div>
      )}

      {!isFinished && !myParticipant && !isStopped && (
        <div className="bg-m3-surface p-8 rounded-[28px] border border-m3-outline-variant/50 relative overflow-hidden">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="flex-1 w-full">
              <h3 className="font-normal text-2xl text-m3-on-surface mb-2">{t('joinToPlay')}</h3>
              <p className="text-m3-on-surface-variant text-sm mb-6">{t('rouletteCannotChange')} <span className="text-google-red font-bold">{t('cannotBeChanged')}</span>.</p>
              <input type="text" value={joinName} onChange={e => setJoinName(e.target.value)} placeholder={t('entryNamePlaceholder')} className="w-full px-4 py-3 bg-m3-surface-container-high rounded-xl border border-m3-outline outline-none focus:border-google-yellow focus:border-2 text-m3-on-surface" />
            </div>
            <div className="w-full md:w-1/2 bg-m3-surface-container-high rounded-2xl p-6 border border-transparent">
              <div className="flex justify-between items-center mb-6"><label className="font-medium text-m3-on-surface-variant">{t('valueLabel')}</label><span className="text-4xl font-normal text-google-yellow">{joinValue}</span></div>
              <input type="range" min="0" max="100" value={joinValue} onChange={e => setJoinValue(parseInt(e.target.value))} className="w-full h-2 bg-m3-outline-variant rounded-lg appearance-none cursor-pointer accent-google-yellow" />
              <button onClick={() => actions.handleJoinRoulette(project.id, joinName, joinValue)} className="w-full mt-8 bg-google-yellow text-gray-900 text-lg font-medium py-3 rounded-full hover:shadow-elevation-1 transition-shadow">{t('submitEntry')}</button>
            </div>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6 mt-8">
        <div className="bg-m3-surface border border-m3-outline-variant/20 rounded-[24px] overflow-hidden p-6">
          <h3 className="font-medium text-m3-on-surface mb-4">{t('participants')} ({count})</h3>
          <div className="max-h-[300px] overflow-y-auto pr-2">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase text-m3-on-surface-variant border-b border-m3-outline-variant/20"><tr><th className="px-4 py-3 font-medium">#</th><th className="px-4 py-3 font-medium">Name</th><th className="px-4 py-3 text-right font-medium">Val</th></tr></thead>
              <tbody className="">
                {sortedParticipants.map((p, idx) => (
                  <tr key={p.id} className={`border-b border-m3-outline-variant/10 last:border-0 hover:bg-m3-surface-container-high/50 transition-colors`}>
                    <td className="px-4 py-3 text-m3-on-surface-variant font-mono">{idx} {isFinished && p.uid === finalWinner?.uid && '👑'}</td>
                    <td className={`px-4 py-3 ${p.uid === user?.uid ? 'font-bold text-google-blue' : 'text-m3-on-surface'}`}>{p.name}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-m3-on-surface-variant">{isFinished || p.uid === user?.uid ? p.value : '***'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-m3-surface-container-high rounded-[24px] p-6 text-m3-on-surface overflow-hidden border border-transparent">
          <h3 className="font-medium mb-6 flex gap-2 items-center"><ChartLine className="w-5 h-5 text-m3-on-surface-variant" /> {t('distributionChart')}</h3>
          {!isFinished ? (
            <div className="text-m3-on-surface-variant/50 flex flex-col items-center justify-center py-10 text-sm">
               <Lock className="w-8 h-8 mb-2 opacity-20" />
               <span>{t('availAfterResults')}</span>
            </div>
          ) : data.length > 1 ? (
            <svg viewBox={`0 -5 100 55`} className="w-full h-40 overflow-visible">
              <polyline fill="none" stroke="#FBBC05" strokeWidth="2" points={data.map((d, i) => `${(i / (data.length - 1)) * 100},${50 - (d.y / Math.max(...data.map((p) => p.y))) * 50}`).join(' ')} />
              {data.map((d, i) => <circle key={i} cx={(i / (data.length - 1)) * 100} cy={50 - (d.y / Math.max(...data.map((p) => p.y))) * 50} r="2" fill="#fff" stroke="#FBBC05" strokeWidth="1" />)}
            </svg>
          ) : <div className="text-m3-on-surface-variant/50 text-center py-10 text-sm">{t('notEnoughData')}</div>}
        </div>
      </div>
      <InfoCard
        title={t('rouletteHelpTitle')}
        steps={t('rouletteHelpSteps')}
      />
    </div>
  );
}

// --- Admin Dashboard component ---
function AdminDashboard({ projects, items, rooms, rouletteParticipants, onClose, t }) {
  // Logic to find orphans
  const projectIds = new Set(projects.map(p => p.id));
  const orphans = {
    items: items.filter(i => !projectIds.has(i.projectId)),
    rooms: rooms.filter(r => !projectIds.has(r.projectId)),
    participants: rouletteParticipants.filter(p => !projectIds.has(p.projectId))
  };

  const hasOrphans = orphans.items.length > 0 || orphans.rooms.length > 0 || orphans.participants.length > 0;

  const cleanOrphans = async () => {
    if (!window.confirm(t('orphanConfirm', { items: orphans.items.length, rooms: orphans.rooms.length, participants: orphans.participants.length }))) return;

    try {
      for (const item of orphans.items) await deleteDoc(doc(db, 'voting_items', item.id));
      for (const room of orphans.rooms) await deleteDoc(doc(db, 'rooms', room.id));
      for (const p of orphans.participants) await deleteDoc(doc(db, 'roulette_participants', p.id));
      alert(t('orphanSuccess'));
    } catch (e) {
      alert(t('orphanError') + e.message);
    }
  };

  const deleteProject = async (project) => {
    if (window.confirm(t('projectDeleteConfirm', { title: project.title, id: project.id }))) {
      await deleteDoc(doc(db, 'projects', project.id));
    }
  }

  return (
    <div className="animate-fade-in pb-20">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-normal text-m3-on-surface flex items-center gap-3">
          <Shield className="w-8 h-8 text-google-blue" />
          {t('adminTitle')}
        </h1>
        <button onClick={onClose} className="text-sm font-medium text-google-blue hover:underline">{t('exitAdmin')}</button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-m3-surface-container p-4 rounded-xl">
          <div className="text-m3-on-surface-variant text-xs uppercase mb-1">{t('totalProjects')}</div>
          <div className="text-3xl font-normal">{projects.length}</div>
        </div>
        <div className="bg-m3-surface-container p-4 rounded-xl">
          <div className="text-m3-on-surface-variant text-xs uppercase mb-1">{t('items')}</div>
          <div className="text-3xl font-normal">{items.length}</div>
        </div>
        <div className="bg-m3-surface-container p-4 rounded-xl">
          <div className="text-m3-on-surface-variant text-xs uppercase mb-1">{t('teams')}</div>
          <div className="text-3xl font-normal">{rooms.length}</div>
        </div>
        <div className="bg-m3-surface-container p-4 rounded-xl">
          <div className="text-m3-on-surface-variant text-xs uppercase mb-1">{t('participants')}</div>
          <div className="text-3xl font-normal">{rouletteParticipants.length}</div>
        </div>
      </div>

      {/* Cleanup Section */}
      <div className="bg-m3-surface-container-high rounded-[24px] p-6 mb-8 border border-google-red/20 relative overflow-hidden">
        <div className="flex flex-col md:flex-row justify-between items-center z-10 relative gap-4">
          <div>
            <h2 className="text-xl font-medium text-m3-on-surface flex items-center gap-2">
              <Database className="w-5 h-5 text-google-red" />
              {t('cleanOrphans')}
            </h2>
            <p className="text-sm text-m3-on-surface-variant mt-1">
              {t('orphanDetected', { items: orphans.items.length, rooms: orphans.rooms.length, participants: orphans.participants.length })}
              <br /><span className="text-xs opacity-70">{t('orphanNote')}</span>
            </p>
          </div>
          <button
            onClick={cleanOrphans}
            disabled={!hasOrphans}
            className={`px-6 py-2.5 rounded-full font-medium transition-all whitespace-nowrap flex items-center gap-2 ${hasOrphans ? 'bg-google-red text-white shadow-elevation-1 hover:shadow-elevation-2' : 'bg-m3-on-surface/10 text-m3-on-surface-variant cursor-not-allowed'}`}
          >
            <Trash2 className="w-4 h-4" />
            {t('cleanOrphans')}
          </button>
        </div>
      </div>

      {/* Project List */}
      <div className="bg-m3-surface-container rounded-[24px] overflow-hidden">
        <div className="p-4 border-b border-m3-outline-variant/50 font-medium bg-m3-surface-container-high/50 flex justify-between items-center">
          <span>{t('allProjectsManager')} ({projects.length})</span>
          <span className="text-xs text-m3-on-surface-variant font-normal">{t('sortedByDate')}</span>
        </div>
        <div className="max-h-[500px] overflow-y-auto">
          {projects.map(p => (
            <div key={p.id} className="flex justify-between items-center p-4 border-b border-m3-outline-variant/10 hover:bg-m3-on-surface/5 group">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold 
                      ${p.type === 'vote' ? 'bg-google-blue/10 text-google-blue' : p.type === 'team' ? 'bg-google-red/10 text-google-red' : 'bg-google-yellow/10 text-google-yellow'}`}>
                  {p.type[0].toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-m3-on-surface group-hover:text-google-blue transition-colors">{p.title}</div>
                  <div className="text-xs text-m3-on-surface-variant font-mono flex gap-2">
                    <span>ID: {p.id}</span>
                    <span>•</span>
                    <span>{new Date(p.createdAt).toLocaleDateString()}</span>
                    <span>•</span>
                    <span>{t('creators')}: {p.creatorName}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-md ${p.status === 'active' ? 'bg-google-green/10 text-google-green' : 'bg-m3-on-surface/10 text-m3-on-surface-variant'}`}>{p.status}</span>
                <button onClick={() => deleteProject(p)} className="p-2 text-m3-on-surface-variant hover:text-google-red hover:bg-google-red/10 rounded-full transition-colors" title={t('forceDelete')}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
          {projects.length === 0 && <div className="p-8 text-center text-m3-on-surface-variant/50">{t('dbEmpty')}</div>}
        </div>
      </div>
    </div>
  );
}