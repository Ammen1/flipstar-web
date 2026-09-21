import React, { Suspense, lazy, useCallback } from "react";
import {
  createBrowserRouter,
  Navigate,
  useNavigate,
  useParams,
  useLocation,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { useTheme } from "./contexts/ThemeContext";
import { readFilterParams, writeFilterParams } from "./utils/explorerFeed";

const AppLayout = lazy(() => import("./components/layout/AppLayout"));

const PhoneLoginModal = lazy(() =>
  import("./components/auth/PhoneLoginModal").then((m) => ({
    default: m.PhoneLoginModal,
  })),
);
const SubscriptionRegisterModal = lazy(() =>
  import("./components/auth/SubscriptionRegisterModal").then((m) => ({
    default: m.SubscriptionRegisterModal,
  })),
);
const HomePage = lazy(() =>
  import("./pages/feed/HomePage").then((m) => ({ default: m.HomePage })),
);
const ReelLayout = lazy(() =>
  import("./components/feed/ReelLayout").then((m) => ({
    default: m.ReelLayout || m,
  })),
);
const MessagesPage = lazy(() =>
  import("./pages/messaging/MessagesPage").then((m) => ({
    default: m.MessagesPage,
  })),
);
const ExplorerPage = lazy(() =>
  import("./pages/feed/ExplorerPage").then((m) => ({
    default: m.ExplorerPage,
  })),
);
const EnhancedPostPage = lazy(() =>
  import("./pages/general/EnhancedPostPage").then((m) => ({
    default: m.EnhancedPostPage,
  })),
);
const ProfilePage = lazy(() =>
  import("./pages/profile/ProfilePage").then((m) => ({
    default: m.ProfilePage,
  })),
);
const EditProfilePage = lazy(() =>
  import("./pages/profile/EditProfilePage").then((m) => ({
    default: m.EditProfilePage,
  })),
);
const FollowersListPage = lazy(() =>
  import("./pages/profile/FollowersListPage").then((m) => ({
    default: m.FollowersListPage,
  })),
);
const NotificationsPage = lazy(() =>
  import("./pages/general/NotificationsPage").then((m) => ({
    default: m.NotificationsPage,
  })),
);
const SettingsPage = lazy(() =>
  import("./pages/settings/SettingsPage").then((m) => ({
    default: m.SettingsPage,
  })),
);
const WalletPage = lazy(() =>
  import("./pages/subscription/WalletPage").then((m) => ({
    default: m.WalletPage,
  })),
);
const BuyCoinsPage = lazy(() => import("./pages/wallet/BuyCoinsPage"));
const SubscriptionPage = lazy(() =>
  import("./pages/subscription/SubscriptionPage").then((m) => ({
    default: m.SubscriptionPage,
  })),
);
const CampaignsPage = lazy(() =>
  import("./pages/campaign/CampaignsPage").then((m) => ({
    default: m.CampaignsPage,
  })),
);
const CampaignDetailPage = lazy(() =>
  import("./pages/campaign/CampaignDetailPage").then((m) => ({
    default: m.CampaignDetailPage,
  })),
);
const CampaignLeaderboard = lazy(
  () => import("./pages/campaign/CampaignLeaderboard"),
);
const GlobalLeaderboardPage = lazy(() =>
  import("./pages/leaderboard/GlobalLeaderboardPage").then((m) => ({
    default: m.GlobalLeaderboardPage,
  })),
);
const CampaignFeed = lazy(() => import("./pages/campaign/CampaignFeed"));
const VideoDetailPage = lazy(() =>
  import("./pages/feed/VideoDetailPage").then((m) => ({
    default: m.VideoDetailPage,
  })),
);
const AdminApp = lazy(() =>
  import("./admin/AdminApp").then((m) => ({ default: m.AdminApp })),
);
const DeleteAccountPage = lazy(() =>
  import("./pages/settings/DeleteAccountPage").then((m) => ({
    default: m.DeleteAccountPage,
  })),
);
const PrivacyPolicyPage = lazy(() =>
  import("./pages/settings/PrivacyPolicyPage").then((m) => ({
    default: m.PrivacyPolicyPage,
  })),
);

const PageLoader = () => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "60vh",
      color: "#999",
      fontSize: 14,
    }}
  >
    Loading...
  </div>
);

const Lazy = ({ children }) => (
  <Suspense fallback={<PageLoader />}>{children}</Suspense>
);

function useNavHelpers() {
  const navigate = useNavigate();
  const {
    authUser,
    requestLogout,
    openTopUpModal,
    openSubscriptionModal,
    subscriptionStatus,
    subscriptionChecked,
    setAuthUser,
  } = useAuth();
  const { colors } = useTheme();
  const { reelId: paramReelId } = useParams();

  const openLoginModal = useCallback(() => {
    navigate("/login", { replace: true });
  }, [navigate]);

  const requireAuth = useCallback(() => {
    if (!authUser) {
      openLoginModal();
      return false;
    }
    return true;
  }, [authUser, openLoginModal]);

  return {
    navigate,
    authUser,
    requestLogout,
    openLoginModal,
    openTopUpModal,
    openSubscriptionModal,
    subscriptionStatus,
    subscriptionChecked,
    setAuthUser,
    colors,
    requireAuth,
    paramReelId,
  };
}

// ─── Page Wrappers ────────────────────────────────────────────────────
// These thin wrappers bridge React Router hooks to existing page prop interfaces.
// Existing pages receive props unchanged — zero modifications needed.

function HomePageWrapper() {
  const h = useNavHelpers();
  return (
    <HomePage
      user={h.authUser}
      subscriptionStatus={h.subscriptionStatus}
      onShowProfile={(userId) =>
        h.navigate(userId ? `/profile/${userId}` : "/profile")
      }
      onShowPostPage={() => h.navigate("/create")}
      onRequireAuth={h.openLoginModal}
      onShowExplorer={() => h.navigate("/explore")}
      onShowLeaderboard={() => h.navigate("/leaderboard")}
      onShowVideoDetail={(reelId) => h.navigate(`/post/${reelId}`)}
      onShowCampaigns={() => h.navigate("/campaigns")}
      onShowCampaignDetail={(campaignId) =>
        h.navigate(`/campaigns/${campaignId}`)
      }
      onShowWallet={() => h.navigate("/wallet")}
      onShowCoinPurchase={h.openTopUpModal}
      onShowSubscription={h.openSubscriptionModal}
    />
  );
}

function ReelLayoutWrapper() {
  const h = useNavHelpers();
  const location = useLocation();
  return (
    <ReelLayout
      user={h.authUser}
      activeTab="reels"
      videosOnly={true}
      onLogout={h.requestLogout}
      onRequireAuth={h.openLoginModal}
      onShowPostPage={() => h.navigate("/create")}
      onShowProfile={(userId) =>
        h.navigate(userId ? `/profile/${userId}` : "/profile")
      }
      onShowSettings={() => h.navigate("/settings")}
      onShowCampaigns={() => h.navigate("/campaigns")}
      onCampaignClick={(campaignId) => h.navigate(`/campaigns/${campaignId}`)}
      onShowNotifications={() => h.navigate("/notifications")}
      onShowVideoDetail={(reelId) => h.navigate(`/post/${reelId}`)}
      onShowExplorer={() => h.navigate("/explore")}
      onShowWallet={() => h.navigate("/wallet")}
      onShowCoinPurchase={h.openTopUpModal}
      subscriptionStatus={h.subscriptionStatus}
      onShowSubscription={h.openSubscriptionModal}
    />
  );
}

function MessagesPageWrapper() {
  const h = useNavHelpers();
  return (
    <MessagesPage
      user={h.authUser}
      onShowProfile={(userId) =>
        h.navigate(userId ? `/profile/${userId}` : "/profile")
      }
      onRequireAuth={h.openLoginModal}
      onShowPostPage={() => h.navigate("/create")}
      /* Distinct from onShowPostPage, which across this app means "open the
         composer" and ignores its argument. Tapping a shared post card was
         wired to that one, so it navigated to /create instead of to the post.
         This is the same mapping every other screen uses for a post. */
      onOpenPost={(reelId) => h.navigate(`/post/${reelId}`)}
    />
  );
}

function ExplorerPageWrapper() {
  const h = useNavHelpers();
  // The chosen category and time range live in the URL
  // (/explore?category=dance&range=30d), so a refresh or a shared link keeps
  // them. `replace` keeps each chip tap out of the back-button history.
  const [searchParams, setSearchParams] = useSearchParams();
  const { categorySlug, timeRange } = readFilterParams(searchParams);
  const onFiltersChange = useCallback(
    (next) =>
      setSearchParams((prev) => writeFilterParams(prev, next), {
        replace: true,
      }),
    [setSearchParams],
  );
  return (
    <ExplorerPage
      initialCategorySlug={categorySlug}
      initialTimeRange={timeRange}
      onFiltersChange={onFiltersChange}
      user={h.authUser}
      onBack={() => h.navigate(-1)}
      onShowProfile={(userId) =>
        h.navigate(userId ? `/profile/${userId}` : "/profile")
      }
      onShowVideoDetail={(reelId) => h.navigate(`/post/${reelId}`)}
      onShowPostDetail={(postId) => h.navigate(`/post/${postId}`)}
      onShowPostPage={() => h.navigate("/create")}
      onRequireAuth={h.openLoginModal}
      onShowSettings={() => h.navigate("/settings")}
      onShowNotifications={() => h.navigate("/notifications")}
    />
  );
}

function EnhancedPostPageWrapper() {
  const h = useNavHelpers();
  return (
    <EnhancedPostPage
      user={h.authUser}
      onBack={() => h.navigate(-1)}
      // Straight to Home once the upload is accepted; the corner indicator
      // follows the processing. `replace`, so Back does not reopen the
      // composer for a post that is already made.
      onPostSuccess={() => h.navigate("/", { replace: true })}
      onNavHome={() => h.navigate("/")}
      onNavReels={() => h.navigate("/reels")}
      onNavMessages={() => h.navigate("/messages")}
      onNavProfile={() => h.navigate("/profile")}
      onShowCoinPurchase={h.openTopUpModal}
      onRequireAuth={h.openLoginModal}
      subscriptionStatus={h.subscriptionStatus}
      onShowSubscription={h.openSubscriptionModal}
    />
  );
}

function ProfilePageWrapper() {
  const h = useNavHelpers();
  const { userId } = useParams();
  return (
    <ProfilePage
      user={h.authUser}
      userId={userId ? parseInt(userId) : h.authUser?.id}
      onBack={() => h.navigate(-1)}
      onEditProfile={() => h.navigate("/profile/edit")}
      onShowSettings={() => h.navigate("/settings")}
      onShowWallet={() => h.navigate("/wallet")}
      onShowSubscription={h.openSubscriptionModal}
      onShowCoinPurchase={h.openTopUpModal}
      onShowPostDetail={(postId, isVideo) => h.navigate(`/post/${postId}`)}
      onShowFollowers={(uid) =>
        h.navigate(`/profile/${uid || h.authUser?.id}/followers`)
      }
      onShowFollowing={(uid) =>
        h.navigate(`/profile/${uid || h.authUser?.id}/following`)
      }
    />
  );
}

function EditProfilePageWrapper() {
  const h = useNavHelpers();
  return (
    <EditProfilePage
      user={h.authUser}
      onBack={() => h.navigate(-1)}
      onSave={(updatedUser) => h.setAuthUser(updatedUser)}
    />
  );
}

function FollowersListPageWrapper() {
  const h = useNavHelpers();
  const { userId } = useParams();
  const location = useLocation();
  const type = location.pathname.endsWith("/following")
    ? "following"
    : "followers";
  return (
    <FollowersListPage
      user={h.authUser}
      userId={userId ? parseInt(userId) : h.authUser?.id}
      type={type}
      onBack={() => h.navigate(-1)}
      onUserClick={(userId) => {
        const id = typeof userId === "object" ? userId.id : userId;
        h.navigate(`/profile/${id}`);
      }}
    />
  );
}

function NotificationsPageWrapper() {
  const h = useNavHelpers();
  return (
    <NotificationsPage
      user={h.authUser}
      onUserClick={(userId) => h.navigate(`/profile/${userId}`)}
      onBack={() => h.navigate(-1)}
      onShowPostPage={() => h.navigate("/create")}
      onLogout={h.requestLogout}
      onShowProfile={() => h.navigate("/profile")}
      onShowSettings={() => h.navigate("/settings")}
      onShowCampaigns={() => h.navigate("/campaigns")}
      onShowVideoDetail={(reelId) => h.navigate(`/post/${reelId}`)}
    />
  );
}

function SettingsPageWrapper() {
  const h = useNavHelpers();
  return (
    <SettingsPage
      user={h.authUser}
      onClose={() => h.navigate(-1)}
      onLogout={h.requestLogout}
      onShowWallet={() => h.navigate("/wallet")}
      // Settings navigates to the page, it does not open the sheet. The sheet
      // exists so that asking somebody to subscribe does not tear down the
      // feed they were watching; from Settings there is no feed to protect,
      // and a row in a settings list is expected to take you somewhere you
      // can link to and come back from.
      onShowSubscription={() => h.navigate("/subscription")}
      onShowEditProfile={() => h.navigate("/profile/edit")}
    />
  );
}

function WalletPageWrapper() {
  const h = useNavHelpers();
  return (
    <WalletPage
      theme={h.colors}
      onBack={() => h.navigate(-1)}
      onShowCoinPurchase={h.openTopUpModal}
    />
  );
}

// Buy Coins is a full page now (it replaced the old top-up modal). `returnTo`
// is set by AppLayout when the page is opened from a "buy coins" call site so
// the user lands back where they started.
function BuyCoinsPageWrapper() {
  const h = useNavHelpers();
  const location = useLocation();
  const returnTo = location.state && location.state.returnTo;
  const goBack = useCallback(() => {
    if (returnTo) h.navigate(returnTo);
    else if (window.history.length > 1) h.navigate(-1);
    else h.navigate("/wallet");
  }, [returnTo, h.navigate]);
  return <BuyCoinsPage theme={h.colors} onBack={goBack} onDone={goBack} />;
}

function SubscriptionPageWrapper() {
  const h = useNavHelpers();
  return (
    <SubscriptionPage
      user={h.authUser}
      onBack={() => h.navigate(-1)}
      onAuthSuccess={(user, token) => {
        h.setAuthUser(user);
        localStorage.setItem("authToken", token);
      }}
    />
  );
}

function CampaignsPageWrapper() {
  const h = useNavHelpers();
  return (
    <CampaignsPage
      onCampaignClick={(id) => h.navigate(`/campaigns/${id}`)}
      onBack={() => h.navigate(-1)}
    />
  );
}

function CampaignDetailPageWrapper() {
  const h = useNavHelpers();
  const { campaignId } = useParams();
  return (
    <CampaignDetailPage
      campaignId={parseInt(campaignId)}
      onBack={() => h.navigate("/campaigns")}
      onShowLeaderboard={() =>
        h.navigate(`/campaigns/${campaignId}/leaderboard`)
      }
      onShowFeed={() => h.navigate(`/campaigns/${campaignId}/feed`)}
    />
  );
}

// The global leaderboard used to render inside HomePage's flex row, which
// made it a sibling of the feed rather than a page of its own. It is a real
// route now, so it fills the main area and browser back works.
function GlobalLeaderboardPageWrapper() {
  const h = useNavHelpers();
  return (
    <GlobalLeaderboardPage
      onBack={() =>
        window.history.length > 1 ? h.navigate(-1) : h.navigate("/")
      }
      onShowProfile={(userId) =>
        h.navigate(userId ? `/profile/${userId}` : "/profile")
      }
    />
  );
}

function CampaignLeaderboardWrapper() {
  const h = useNavHelpers();
  const { campaignId } = useParams();
  return (
    <CampaignLeaderboard
      campaignId={parseInt(campaignId)}
      onBack={() => h.navigate(`/campaigns/${campaignId}`)}
    />
  );
}

function CampaignFeedWrapper() {
  const h = useNavHelpers();
  const { campaignId } = useParams();
  return (
    <CampaignFeed
      campaignId={parseInt(campaignId)}
      onBack={() => h.navigate(`/campaigns/${campaignId}`)}
      onShowCoinPurchase={h.openTopUpModal}
    />
  );
}

function VideoDetailPageWrapper() {
  const h = useNavHelpers();
  const { reelId } = useParams();
  const location = useLocation();
  const openedDirectly = location.key === "default";
  return (
    <VideoDetailPage
      reelId={parseInt(reelId)}
      user={h.authUser}
      onBack={() => (openedDirectly ? h.navigate("/") : h.navigate(-1))}
      onShowProfile={(userId) =>
        h.navigate(userId ? `/profile/${userId}` : "/profile")
      }
      subscriptionStatus={h.subscriptionStatus}
      onShowSubscription={h.openSubscriptionModal}
    />
  );
}

function SubscriptionPageStandalone() {
  const h = useNavHelpers();
  const location = useLocation();
  return (
    <Lazy>
      <SubscriptionPage
        user={h.authUser}
        onBack={() => h.navigate("/")}
        onLogin={() => h.navigate("/login")}
        subscriptionHandoff={location.state}
        onAuthSuccess={(user, token) => {
          h.setAuthUser(user);
          localStorage.setItem("authToken", token);
        }}
      />
    </Lazy>
  );
}

function LoginPageWrapper() {
  const h = useNavHelpers();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const prefillPhone = params.get("phone") || "";
  const telebirrOtpMode = params.get("telebirr_otp_mode") === "true";
  return (
    <Lazy>
      <PhoneLoginModal
        prefillPhone={prefillPhone}
        telebirrOtpMode={telebirrOtpMode}
        onSuccess={(u) => {
          h.setAuthUser(u);
          localStorage.setItem(
            "authToken",
            u.token || localStorage.getItem("authToken"),
          );
          h.navigate("/", { replace: true });
        }}
        // "Subscribe" belongs on the plans page. /register is the OTP
        // registration form, which assumes the user already has a
        // subscription to verify against.
        onSignUp={() => h.navigate("/subscription")}
        onClose={() => h.navigate(-1)}
      />
    </Lazy>
  );
}

function RegisterPageWrapper() {
  const h = useNavHelpers();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const prefillPhone = params.get("phone") || "";
  const prefillOtp = params.get("otp") || "";
  const existingUser = params.get("existing_user") === "true";
  const fromTelebirr = params.get("from_telebirr") === "true";
  return (
    <Lazy>
      <SubscriptionRegisterModal
        prefillPhone={prefillPhone}
        prefillOtp={prefillOtp}
        existingUser={existingUser}
        fromTelebirr={fromTelebirr}
        onSuccess={(u, isNewUser) => {
          h.setAuthUser(u);
          localStorage.setItem(
            "authToken",
            u.token || localStorage.getItem("authToken"),
          );
          h.navigate("/", { replace: true });
        }}
        onBackToLogin={() => h.navigate("/login")}
      />
    </Lazy>
  );
}

function AdminWrapper() {
  return (
    <Lazy>
      <AdminApp />
    </Lazy>
  );
}

// ─── Router ───────────────────────────────────────────────────────────

export const router = createBrowserRouter([
  {
    path: "/privacy-policy",
    element: (
      <Lazy>
        <PrivacyPolicyPage />
      </Lazy>
    ),
  },
  {
    path: "/privacy",
    element: <Navigate to="/privacy-policy" replace />,
  },
  {
    path: "/delete-account",
    element: (
      <Lazy>
        <DeleteAccountPage />
      </Lazy>
    ),
  },
  {
    path: "/account-deletion",
    element: <Navigate to="/delete-account" replace />,
  },
  {
    path: "/subscription",
    element: <SubscriptionPageStandalone />,
  },
  {
    path: "/login",
    element: <LoginPageWrapper />,
  },
  {
    path: "/register",
    element: <RegisterPageWrapper />,
  },
  {
    path: "/admin/*",
    element: <AdminWrapper />,
  },
  {
    path: "/",
    element: (
      <Lazy>
        <AppLayout />
      </Lazy>
    ),
    children: [
      {
        index: true,
        element: (
          <Lazy>
            <HomePageWrapper />
          </Lazy>
        ),
      },
      {
        path: "reels",
        element: (
          <Lazy>
            <ReelLayoutWrapper />
          </Lazy>
        ),
      },
      {
        path: "messages",
        element: (
          <Lazy>
            <MessagesPageWrapper />
          </Lazy>
        ),
      },
      {
        path: "explore",
        element: (
          <Lazy>
            <ExplorerPageWrapper />
          </Lazy>
        ),
      },
      {
        path: "create",
        element: (
          <Lazy>
            <EnhancedPostPageWrapper />
          </Lazy>
        ),
      },
      {
        path: "notifications",
        element: (
          <Lazy>
            <NotificationsPageWrapper />
          </Lazy>
        ),
      },
      {
        path: "settings",
        element: (
          <Lazy>
            <SettingsPageWrapper />
          </Lazy>
        ),
      },
      {
        path: "wallet",
        element: (
          <Lazy>
            <WalletPageWrapper />
          </Lazy>
        ),
      },
      {
        path: "buy-coins",
        element: (
          <Lazy>
            <BuyCoinsPageWrapper />
          </Lazy>
        ),
      },
      {
        path: "campaigns",
        element: (
          <Lazy>
            <CampaignsPageWrapper />
          </Lazy>
        ),
      },
      {
        path: "campaigns/:campaignId",
        element: (
          <Lazy>
            <CampaignDetailPageWrapper />
          </Lazy>
        ),
      },
      {
        path: "campaigns/:campaignId/leaderboard",
        element: (
          <Lazy>
            <CampaignLeaderboardWrapper />
          </Lazy>
        ),
      },
      {
        path: "leaderboard",
        element: (
          <Lazy>
            <GlobalLeaderboardPageWrapper />
          </Lazy>
        ),
      },
      {
        path: "campaigns/:campaignId/feed",
        element: (
          <Lazy>
            <CampaignFeedWrapper />
          </Lazy>
        ),
      },
      {
        path: "profile",
        element: (
          <Lazy>
            <ProfilePageWrapper />
          </Lazy>
        ),
      },
      {
        path: "profile/edit",
        element: (
          <Lazy>
            <EditProfilePageWrapper />
          </Lazy>
        ),
      },
      {
        path: "profile/:userId",
        element: (
          <Lazy>
            <ProfilePageWrapper />
          </Lazy>
        ),
      },
      {
        path: "profile/:userId/followers",
        element: (
          <Lazy>
            <FollowersListPageWrapper />
          </Lazy>
        ),
      },
      {
        path: "profile/:userId/following",
        element: (
          <Lazy>
            <FollowersListPageWrapper />
          </Lazy>
        ),
      },
      {
        path: "post/:reelId",
        element: (
          <Lazy>
            <VideoDetailPageWrapper />
          </Lazy>
        ),
      },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);
