import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Menu, Award, Zap, User } from 'lucide-react';
import Papa from 'papaparse';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from './contexts/AuthContext';
import { db } from './config/firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  serverTimestamp 
} from 'firebase/firestore';

const LearningViewer = () => {
    const { user, signInWithGoogle, signOut } = useAuth();
    const [chapters, setChapters] = useState([]);
    const [currentChapter, setCurrentChapter] = useState(0);
    const [currentCard, setCurrentCard] = useState(0);
    const [streak, setStreak] = useState(0);
    const [lastStudyDate, setLastStudyDate] = useState(null);
    const [xp, setXp] = useState(0);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [loading, setLoading] = useState(true);
    const [dailyGoal] = useState(10);
    const [cardsStudiedToday, setCardsStudiedToday] = useState(0);
    const [showCongrats, setShowCongrats] = useState(false);
    const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);
  
    const SHEETS_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQFscVOqoOj_c05nM2zfkQU5pFoUpTTfTdmOGtEJ1gPWMPROzHrBKhHBAvzXrG1CEuZdN34uC65-VHz/pub?gid=0&single=true&output=csv';
  
    // Online status monitoring
    useEffect(() => {
      const handleOnline = () => setIsOnline(true);
      const handleOffline = () => setIsOnline(false);
  
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
  
      return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
      };
    }, []);
  
    // Load content and progress
    useEffect(() => {
      const fetchContent = async () => {
        try {
          const response = await fetch(SHEETS_URL);
          const text = await response.text();
          
          Papa.parse(text, {
            header: true,
            complete: (results) => {
              const chaptersMap = {};
              results.data.forEach(row => {
                if (!row.chapterId || !row.content) return;
                
                if (!chaptersMap[row.chapterId]) {
                  chaptersMap[row.chapterId] = {
                    id: row.chapterId,
                    title: row.chapterTitle,
                    cards: []
                  };
                }
                
                chaptersMap[row.chapterId].cards.push({
                  id: row.id,
                  content: row.content,
                  type: row.type || 'text',
                  difficulty: row.difficulty || 'medium',
                  xpValue: parseInt(row.xpValue) || 10
                });
              });
              
              setChapters(Object.values(chaptersMap));
              setLoading(false);
            }
          });
        } catch (error) {
          console.error('Failed to fetch content:', error);
          setLoading(false);
        }
      };
  
      fetchContent();
      if (user) {
        loadProgress();
      }
    }, [user]);
  
    const loadProgress = async () => {
      if (!user) return;
      
      try {
        const progressRef = doc(db, 'progress', user.uid);
        const progressDoc = await getDoc(progressRef);
        
        if (progressDoc.exists()) {
          const data = progressDoc.data();
          setStreak(data.streak || 0);
          setXp(data.xp || 0);
          setLastStudyDate(data.lastStudyDate);
          setCardsStudiedToday(data.cardsStudiedToday || 0);
          setCurrentChapter(data.currentChapter || 0);
          setCurrentCard(data.currentCard || 0);
        }
      } catch (error) {
        console.error('Failed to load progress:', error);
      }
    };
  
    const saveProgress = async () => {
      if (!user) return;
      
      try {
        const progressRef = doc(db, 'progress', user.uid);
        await setDoc(progressRef, {
          userId: user.uid,
          streak,
          xp,
          lastStudyDate: new Date().toISOString(),
          cardsStudiedToday,
          currentChapter,
          currentCard,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (error) {
        console.error('Failed to save progress:', error);
      }
    };
  
    const completeCard = async () => {
      const currentChapterData = chapters[currentChapter];
      const card = currentChapterData?.cards[currentCard];
      
      if (!card) return;
  
      // Add XP
      const newXp = xp + card.xpValue;
      setXp(newXp);
      
      // Update streak and study count
      const today = new Date().toDateString();
      const lastDate = lastStudyDate ? new Date(lastStudyDate).toDateString() : null;
      
      let newStreak = streak;
      let newCardsStudiedToday = cardsStudiedToday;
      
      if (today !== lastDate) {
        newCardsStudiedToday = 1;
        if (lastDate === new Date(Date.now() - 86400000).toDateString()) {
          newStreak = streak + 1;
          if (newStreak % 5 === 0) {
            setShowCongrats(true);
          }
        } else {
          newStreak = 1;
        }
      } else {
        newCardsStudiedToday = cardsStudiedToday + 1;
        if (newCardsStudiedToday === dailyGoal) {
          setShowCongrats(true);
        }
      }
      
      setStreak(newStreak);
      setCardsStudiedToday(newCardsStudiedToday);
      setLastStudyDate(new Date().toISOString());
      
      // Move to next card
      let newCurrentCard = currentCard;
      let newCurrentChapter = currentChapter;
      
      if (currentCard < currentChapterData.cards.length - 1) {
        newCurrentCard = currentCard + 1;
      } else if (currentChapter < chapters.length - 1) {
        newCurrentChapter = currentChapter + 1;
        newCurrentCard = 0;
      }
      
      setCurrentCard(newCurrentCard);
      setCurrentChapter(newCurrentChapter);
      
      // Save all progress to Firebase
      await saveProgress();
    };
  
    if (!user) {
      return (
        <div className="flex items-center justify-center h-screen bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
          <div className="bg-white p-8 rounded-lg shadow-xl text-center">
            <h2 className="text-2xl font-bold mb-4">Welcome to Learning Viewer</h2>
            <p className="text-gray-600 mb-6">Please sign in to continue</p>
            <button
              onClick={signInWithGoogle}
              className="bg-white border border-gray-300 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center"
            >
              Sign in with Google
            </button>
          </div>
        </div>
      );
    }
  
    if (loading) {
      return (
        <div className="flex items-center justify-center h-screen bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
          <div className="text-2xl text-white animate-pulse">Loading your learning journey...</div>
        </div>
      );
    }
  
    const currentChapterData = chapters[currentChapter];
    const currentCardData = currentChapterData?.cards[currentCard];
    const progressPercentage = (cardsStudiedToday / dailyGoal) * 100;
  
    if (!currentChapterData || !currentCardData) {
      return (
        <div className="flex items-center justify-center h-screen bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
          <div className="text-2xl text-white">No content available</div>
        </div>
      );
    }
  
    return (
      <div className="flex flex-col h-screen bg-gradient-to-r from-indigo-500 to-purple-600">
        {/* Header with user profile and stats */}
        <div className="sticky top-0 bg-white bg-opacity-95 shadow-lg">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center">
              <button
                onClick={() => setIsDrawerOpen(true)}
                className="p-2 hover:bg-gray-100 rounded-full mr-2"
              >
                <Menu size={24} />
              </button>
              <img 
                src={user.photoURL} 
                alt={user.displayName} 
                className="w-8 h-8 rounded-full mr-2"
              />
              <span className="font-medium">{user.displayName}</span>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center">
                <Zap className="text-yellow-400" size={20} />
                <span className="ml-1 font-bold">{streak} days</span>
              </div>
              <div className="flex items-center">
                <Award className="text-purple-500" size={20} />
                <span className="ml-1 font-bold">{xp} XP</span>
              </div>
              <button
                onClick={signOut}
                className="text-gray-600 hover:text-gray-800"
              >
                Sign Out
              </button>
            </div>
          </div>
  
          {/* Daily progress bar */}
          <div className="px-4 pb-2">
            <div className="relative h-2 bg-gray-200 rounded-full">
              <div 
                className="absolute h-full bg-green-400 rounded-full transition-all duration-300"
                style={{ width: `${Math.min(progressPercentage, 100)}%` }}
              />
            </div>
            <div className="text-center text-sm mt-1 text-white">
              {cardsStudiedToday} / {dailyGoal} cards today
            </div>
          </div>
        </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4">
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <div className="p-6">
              <h2 className="text-2xl font-bold mb-4">{currentChapterData.title}</h2>
              <div className="prose prose-sm">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {currentCardData.content}
                </ReactMarkdown>
              </div>
            </div>
          </div>

          <button
            onClick={completeCard}
            className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200 mt-4"
          >
            Got it! (+{currentCardData.xpValue} XP)
          </button>
        </div>
      </div>

      {/* Navigation */}
      <div className="sticky bottom-0 bg-white border-t shadow-lg">
        <div className="flex justify-between items-center p-4">
          <div className="text-sm text-gray-600">
            Card {currentCard + 1} of {currentChapterData.cards.length}
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => setCurrentCard(prev => Math.max(0, prev - 1))}
              className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              disabled={currentCard === 0}
            >
              <ChevronLeft size={24} />
            </button>
            <button
              onClick={() => setCurrentCard(prev => 
                Math.min(currentChapterData.cards.length - 1, prev + 1)
              )}
              className="p-2 hover:bg-gray-100 rounded-lg disabled:opacity-50"
              disabled={currentCard === currentChapterData.cards.length - 1}
            >
              <ChevronRight size={24} />
            </button>
          </div>
        </div>
      </div>

      {/* Congratulations modal */}
      {showCongrats && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 text-center">
            <Award className="mx-auto text-yellow-400 mb-4" size={48} />
            <h2 className="text-2xl font-bold mb-2">
              {streak % 5 === 0 ? `${streak} Day Streak!` : 'Daily Goal Reached!'}
            </h2>
            <p className="text-gray-600 mb-4">
              Keep up the great work! 🎉
            </p>
            <button
              onClick={() => setShowCongrats(false)}
              className="bg-purple-500 text-white px-4 py-2 rounded-lg hover:bg-purple-600 transition-colors"
            >
              Continue Learning
            </button>
          </div>
        </div>
      )}

      {/* Chapter drawer */}
      {isDrawerOpen && (
        <>
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-40" 
            onClick={() => setIsDrawerOpen(false)} 
          />
          <div className="fixed inset-y-0 left-0 w-64 bg-white shadow-lg z-50">
            <div className="p-4">
              <h2 className="text-xl font-bold mb-4">Chapters</h2>
              {chapters.map((chapter, idx) => (
                <button
                  key={chapter.id}
                  onClick={() => {
                    setCurrentChapter(idx);
                    setCurrentCard(0);
                    setIsDrawerOpen(false);
                  }}
                  className={`w-full text-left p-3 rounded-lg mb-2 ${
                    idx === currentChapter ? 'bg-purple-100 text-purple-700' : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="font-medium">{chapter.title}</div>
                  <div className="text-sm text-gray-600">
                    {chapter.cards.length} cards
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default LearningViewer;