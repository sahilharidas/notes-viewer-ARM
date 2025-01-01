import React from 'react';
import { Award, Zap, Brain, TrendingUp, Clock } from 'lucide-react';

const XPStatsHeader = ({ xp, xpStats, streak, dueCardsStreak }) => {
  return (
    <div className="flex items-center space-x-4">
      {/* XP Stats Group */}
      <div className="flex items-center bg-purple-50 rounded-lg px-3 py-1.5">
        <div className="flex items-center">
          <Award className="text-purple-500" size={20} />
          <span className="ml-1 font-bold text-purple-700">{xp} XP</span>
        </div>
        
        <div className="mx-2 h-4 w-px bg-purple-200" />
        
        <div className="flex items-center">
          <TrendingUp className="text-green-500" size={18} />
          <span className="ml-1 text-sm text-green-700">
            {xpStats.remainingXP} left today
          </span>
        </div>
      </div>

      {/* Daily Stats Group */}
      <div className="flex items-center bg-blue-50 rounded-lg px-3 py-1.5">
        <div className="flex items-center">
          <Zap className="text-yellow-500" size={20} />
          <span className="ml-1 font-bold text-blue-700">{streak} days</span>
        </div>
        
        <div className="mx-2 h-4 w-px bg-blue-200" />
        
        <div className="flex items-center">
          <Clock className="text-blue-500" size={18} />
          <span className="ml-1 text-sm text-blue-700">
            {xpStats.hourlyReviews}/100 this hour
          </span>
        </div>
      </div>

      {/* Review Streak */}
      <div className="flex items-center bg-green-50 rounded-lg px-3 py-1.5">
        <Brain className="text-blue-500" size={20} />
        <span className="ml-1 font-bold text-green-700">
          {dueCardsStreak} review streak
        </span>
      </div>
    </div>
  );
};

export default XPStatsHeader;